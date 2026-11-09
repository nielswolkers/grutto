use crate::auth::{self, Tokens};
use crate::{AttendanceSummary, CourseAverage, GradeRow, SchoolYearData};
use reqwest::StatusCode;
use serde_json::Value;
use std::time::Duration;

const MAX_NETWORK_RETRIES: u32 = 3;

pub struct MagisterClient {
    http: reqwest::Client,
    tokens: Tokens,
    base: String,
}

fn s(v: &Value) -> Option<String> {
    match v {
        Value::String(x) if !x.trim().is_empty() => Some(x.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}
fn first_string(values: &[Option<String>]) -> String {
    values.iter().find_map(|v| v.clone()).unwrap_or_default()
}
fn items(v: &Value) -> Vec<Value> {
    v["Items"].as_array().or(v["items"].as_array()).cloned().unwrap_or_default()
}
fn text<'a>(v: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|k| {
        let x = &v[*k];
        if x.is_null() { None } else { Some(x) }
    })
}
fn is_average(g: &Value) -> bool {
    // Magister's documented/internal enum: 1 = individual grade, 2 = average.
    // Gemairo maps GradeType._type === 2 to "average".
    let kind = first_string(&[
        s(&g["kolom"]["type"]), s(&g["type"]), s(&g["CijferKolom"]["KolomOmschrijving"]),
    ]).to_lowercase();
    g["CijferKolom"]["KolomSoort"].as_i64() == Some(2)
        || kind.contains("gemiddelde")
        || kind == "average"
}
fn course_name(g: &Value) -> String {
    let vak = &g["Vak"];
    first_string(&[
        s(&vak["Omschrijving"]), s(&vak["omschrijving"]), s(&vak["Naam"]),
        s(&g["vak"]["Omschrijving"]), s(&g["vak"]["omschrijving"]), s(&g["vak"]["Naam"]),
    ])
}
fn grade_string(g: &Value) -> String {
    first_string(&[s(&g["CijferStr"]), s(&g["waarde"])])
}
fn date_only(value: &str) -> String {
    value.get(0..10).unwrap_or(value).to_string()
}

impl MagisterClient {
    pub async fn new(tokens: Tokens) -> Result<Self, String> {
        let mut c = Self { http: reqwest::Client::new(), tokens, base: String::new() };
        let meta = c.get_json("https://magister.net/.well-known/host-meta.json?rel=magister-api").await?;
        let href = meta["links"][0]["href"].as_str().ok_or("Could not find school API host")?;
        let u = url::Url::parse(href).map_err(|e| e.to_string())?;
        c.base = format!("{}://{}", u.scheme(), u.host_str().unwrap_or_default());
        Ok(c)
    }

    async fn get_json(&mut self, url: &str) -> Result<Value, String> {
        let mut net_tries = 0;
        let mut refreshed = false;
        loop {
            let res = match self.http.get(url).bearer_auth(&self.tokens.access_token).send().await {
                Ok(r) => r,
                Err(e) => {
                    net_tries += 1;
                    if net_tries > MAX_NETWORK_RETRIES { return Err(format!("Network error: {e}")); }
                    tokio::time::sleep(Duration::from_secs(net_tries as u64)).await;
                    continue;
                }
            };
            match res.status() {
                StatusCode::TOO_MANY_REQUESTS => {
                    let body: Value = res.json().await.unwrap_or(Value::Null);
                    tokio::time::sleep(Duration::from_secs(body["secondsLeft"].as_u64().unwrap_or(1) + 1)).await;
                }
                StatusCode::UNAUTHORIZED if !refreshed => {
                    let rt = self.tokens.refresh_token.clone().ok_or("Session expired")?;
                    let new = auth::refresh(&rt).await?;
                    self.tokens = Tokens { refresh_token: new.refresh_token.clone().or(Some(rt)), ..new };
                    refreshed = true;
                }
                st if st.is_success() => return res.json().await.map_err(|e| e.to_string()),
                st => {
                    let body = res.text().await.unwrap_or_default();
                    return Err(format!("Magister returned {st} for {url}: {body}"));
                }
            }
        }
    }

    pub async fn fetch_all(&mut self) -> Result<Vec<SchoolYearData>, String> {
        let b = self.base.clone();
        let account = self.get_json(&format!("{b}/api/account")).await?;
        let pid = account["Persoon"]["Id"].as_i64().ok_or("No student ID in account")?;
        let years_json = self.get_json(&format!("{b}/api/leerlingen/{pid}/aanmeldingen?begin=1970-01-01")).await?;
        let years = items(&years_json);
        if years.is_empty() { return Err("No school years found".into()); }

        let mut result = Vec::new();
        for year in years {
            let yid = year["id"].as_i64().or(year["Id"].as_i64()).ok_or("School year without id")?;
            let begin = first_string(&[s(&year["begin"]), s(&year["Begin"])]);
            let end = first_string(&[s(&year["einde"]), s(&year["Einde"])]);
            if begin.is_empty() || end.is_empty() { continue; }
            let period_label = format!("{}–{}", begin.get(0..4).unwrap_or(""), end.get(0..4).unwrap_or(""));
            // Use Magister enrollment metadata to show the actual class/group.
            let class_label = first_string(&[
                s(&year["Groep"]["Omschrijving"]), s(&year["Groep"]["omschrijving"]),
                s(&year["groep"]["Omschrijving"]), s(&year["groep"]["omschrijving"]),
                s(&year["Lesgroep"]["Omschrijving"]), s(&year["lesgroep"]["Omschrijving"]),
                s(&year["Type"]["Omschrijving"]), s(&year["type"]["Omschrijving"]),
                s(&year["Opleiding"]["Omschrijving"]),
            ]);
            let label = if class_label.is_empty() { period_label } else { format!("{class_label} · {period_label}") };
            let grade_url = format!("{b}/api/personen/{pid}/aanmeldingen/{yid}/cijfers/cijferoverzichtvooraanmelding?actievePerioden=false&alleenBerekendeKolommen=false&alleenPTAKolommen=false&peildatum={end}");
            let grades_json = self.get_json(&grade_url).await?;
            let all = items(&grades_json);
            let mut grades = Vec::new();
            let mut averages: Vec<CourseAverage> = Vec::new();

            for g in &all {
                let course = course_name(g);
                let value = grade_string(g);
                if is_average(g) && !course.is_empty() && !value.is_empty() {
                    if let Some(existing) = averages.iter_mut().find(|a| a.course == course) {
                        existing.average = value.clone();
                    } else {
                        averages.push(CourseAverage { course: course.clone(), average: value.clone() });
                    }
                }
                if g["CijferKolom"]["KolomSoort"].as_i64() != Some(1) { continue; }
                let col = g["CijferKolom"]["Id"].as_i64().unwrap_or_default();
                let extra = self.get_json(&format!("{b}/api/personen/{pid}/aanmeldingen/{yid}/cijfers/extracijferkolominfo/{col}")).await
                    .unwrap_or(Value::Null);
                let title = first_string(&[
                    s(&g["omschrijving"]), s(&g["kolom"]["omschrijving"]),
                    s(&extra["WerkInformatieOmschrijving"]), s(&extra["KolomOmschrijving"]),
                    s(&g["CijferKolom"]["KolomOmschrijving"]),
                ]);
                let weight = first_string(&[
                    s(&g["kolom"]["weegfactor"]), s(&extra["Weging"]), s(&g["weegfactor"]),
                ]);
                grades.push(GradeRow { course, title, grade: value, weight });
            }

            let attendance = self.fetch_attendance(pid, &begin, &end).await.unwrap_or_default();
            result.push(SchoolYearData { id: yid, label, begin, end, grades, course_averages: averages, attendance });
        }
        if result.is_empty() { return Err("No usable school years were returned by Magister".into()); }
        Ok(result)
    }

    async fn fetch_attendance(&mut self, pid: i64, begin: &str, end: &str) -> Result<AttendanceSummary, String> {
        let b = self.base.clone();
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        let end_date = date_only(end);
        let until = if today < end_date { today } else { end_date };
        let from = date_only(begin);
        let ver_url = format!("{b}/api/m6/leerlingen/{pid}/verantwoordingen?begin={from}&einde={until}");
        let lessons_url = format!("{b}/api/leerlingen/{pid}/afspraken?status=actief&begin={from}&einde={until}");
        let ver_json = self.get_json(&ver_url).await;
        let lesson_json = self.get_json(&lessons_url).await;
        let ver = ver_json.map(|v| items(&v)).unwrap_or_default();
        let lessons = lesson_json.map(|v| items(&v)).unwrap_or_default();
        if ver.is_empty() { return Ok(AttendanceSummary::default()); }
        let total = if lessons.is_empty() { ver.len() } else { lessons.len() };
        let mut absent = 0usize;
        let mut sick = 0usize;
        let mut unauthorized = 0usize;
        let mut late = 0usize;
        let mut excused = 0usize;

        for entry in &ver {
            let regs = entry["verantwoordingen"].as_array()
                .or(entry["registraties"].as_array())
                .cloned()
                .unwrap_or_else(|| text(entry, &["verantwoording"]).cloned().into_iter().collect());
            let mut category = "";
            let mut is_ok = true;
            for reg in regs {
                let raw = first_string(&[
                    s(&reg["reden"]["verantwoordingType"]), s(&reg["verantwoordingType"]),
                    s(&reg["reden"]["code"]), s(&reg["attendanceTypeCode"]), s(&reg["code"]), s(&reg["type"]),
                ]).to_uppercase();
                let typ = match raw.as_str() {
                    "AB" | "ABSENT" | "ABSENTIE" => "AB",
                    "ZK" | "ZIEK" => "ZK",
                    "UI" | "UITGESTUURD" => "UI",
                    "TL" | "TELAAT" => "TL",
                    "VR" | "VRIJSTELLING" => "VR",
                    _ => "",
                };
                if ["AB", "ZK", "UI"].contains(&typ) {
                    category = typ;
                    is_ok = reg["reden"]["isGeoorloofd"].as_bool()
                        .or(reg["isGeoorloofd"].as_bool())
                        .or(reg["geoorloofd"].as_bool()).unwrap_or(true);
                    break;
                }
                if typ == "VR" { category = "VR"; }
                if typ == "TL" && category.is_empty() { category = "TL"; }
            }
            match category {
                "AB" | "UI" => { absent += 1; if !is_ok { unauthorized += 1; } }
                "ZK" => { absent += 1; sick += 1; }
                "VR" => excused += 1,
                "TL" => late += 1,
                _ => {}
            }
        }
        let counted = total.saturating_sub(excused);
        let present = counted.saturating_sub(absent);
        let percentage = if counted > 0 { (present as f64 * 100.0 / counted as f64).round() as u8 } else { 0 };
        Ok(AttendanceSummary { total_lessons: total, absent, sick, unauthorized, late, excused, present, percentage })
    }
}

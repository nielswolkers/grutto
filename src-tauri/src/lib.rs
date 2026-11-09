mod api;
mod auth;

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct GradeRow {
    pub course: String, pub title: String, pub grade: String, pub weight: String,
    pub subtitle: String, pub date: String, pub period: String, pub pta: bool,
    pub passed: Option<bool>, pub column_id: i64,
}
#[derive(Serialize, Clone)]
pub struct CourseAverage { pub course: String, pub average: String }
#[derive(Serialize, Clone, Default)]
pub struct AttendanceSummary {
    pub total_lessons: usize, pub absent: usize, pub sick: usize, pub unauthorized: usize,
    pub late: usize, pub excused: usize, pub present: usize, pub percentage: u8,
}
#[derive(Serialize, Clone)]
pub struct SchoolYearData {
    pub id: i64, pub label: String, pub begin: String, pub end: String,
    pub grades: Vec<GradeRow>, pub course_averages: Vec<CourseAverage>,
    pub attendance: AttendanceSummary,
}
#[derive(Serialize, Clone)]
pub struct YearInfo { pub id: i64, pub class_label: String, pub period: String, pub begin: String }

#[derive(Serialize)]
pub struct LoginResult { pub refresh_token: Option<String>, pub years: Vec<YearInfo> }
#[derive(Serialize)]
pub struct FetchResult { pub refresh_token: Option<String>, pub years: Vec<SchoolYearData> }

/// Authenticate with Magister (MagImp login window) and list the available classes.
#[tauri::command]
async fn magister_login(app: tauri::AppHandle) -> Result<LoginResult, String> {
    let tokens = auth::login(&app).await?;
    let mut client = api::MagisterClient::new(tokens).await?;
    let years = client.list_years().await?;
    Ok(LoginResult { refresh_token: client.refresh_token(), years })
}

/// Import the chosen school years using a stored refresh token (also used for startup sync).
#[tauri::command]
async fn magister_fetch(refresh_token: String, year_ids: Option<Vec<i64>>) -> Result<FetchResult, String> {
    let new = auth::refresh(&refresh_token).await?;
    let tokens = auth::Tokens { refresh_token: new.refresh_token.clone().or(Some(refresh_token)), ..new };
    let mut client = api::MagisterClient::new(tokens).await?;
    let years = client.fetch_all(year_ids).await?;
    Ok(FetchResult { refresh_token: client.refresh_token(), years })
}

/// Original MagImp command: login and import every available school year.
#[tauri::command]
async fn magister_login_and_fetch(app: tauri::AppHandle) -> Result<Vec<SchoolYearData>, String> {
    let tokens = auth::login(&app).await?;
    let mut client = api::MagisterClient::new(tokens).await?;
    client.fetch_all(None).await
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![magister_login_and_fetch, magister_login, magister_fetch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

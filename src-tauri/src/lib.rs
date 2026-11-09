mod api;
mod auth;

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct GradeRow { pub course: String, pub title: String, pub grade: String, pub weight: String }
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

/// Authenticate with Magister and import every available school year.
#[tauri::command]
async fn magister_login_and_fetch(app: tauri::AppHandle) -> Result<Vec<SchoolYearData>, String> {
    let tokens = auth::login(&app).await?;
    let mut client = api::MagisterClient::new(tokens).await?;
    client.fetch_all().await
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![magister_login_and_fetch])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

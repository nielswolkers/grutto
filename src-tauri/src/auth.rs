use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::oneshot;
use url::Url;

pub const CLIENT_ID: &str = "M6LOAPP";
pub const REDIRECT_URI: &str = "m6loapp://oauth2redirect/";
pub const SCOPES: &str = "openid profile offline_access magister.mobile magister.ecs";
pub const TOKEN_URL: &str = "https://accounts.magister.net/connect/token";
const AUTHORIZE_URL: &str = "https://accounts.magister.net/connect/authorize";
const LOGIN_LABEL: &str = "magister-login";

#[derive(Deserialize, Clone, Debug)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    #[allow(dead_code)]
    pub id_token: Option<String>,
    #[allow(dead_code)]
    pub expires_in: Option<u64>,
}

fn random_b64(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::rngs::OsRng.fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

fn pkce_pair() -> (String, String) {
    let verifier = random_b64(64); // 86 chars, within 43..128
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

fn is_redirect(url: &Url) -> bool {
    url.as_str().to_ascii_lowercase().starts_with(REDIRECT_URI)
}

/// Reads a parameter from the fragment first (response_type=code id_token), then the query.
fn param(url: &Url, key: &str) -> Option<String> {
    let from = |s: &str| {
        url::form_urlencoded::parse(s.as_bytes())
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.into_owned())
    };
    url.fragment().and_then(from).or_else(|| url.query().and_then(from))
}

pub async fn login(app: &tauri::AppHandle) -> Result<Tokens, String> {
    let (verifier, challenge) = pkce_pair();
    let state = random_b64(16);
    let nonce = random_b64(16);

    let mut auth_url = Url::parse(AUTHORIZE_URL).unwrap();
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("scope", SCOPES)
        .append_pair("response_type", "code id_token")
        .append_pair("state", &state)
        .append_pair("nonce", &nonce)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");

    if let Some(old) = app.get_webview_window(LOGIN_LABEL) {
        let _ = old.close();
    }

    let (tx, rx) = oneshot::channel::<Result<Url, String>>();
    let tx = Arc::new(Mutex::new(Some(tx)));

    let nav_tx = tx.clone();
    let nav_app = app.clone();
    let window = WebviewWindowBuilder::new(app, LOGIN_LABEL, WebviewUrl::External(auth_url))
        .title("Login with Magister")
        .inner_size(480.0, 720.0)
        .on_navigation(move |url| {
            if is_redirect(url) {
                if let Some(sender) = nav_tx.lock().unwrap().take() {
                    let _ = sender.send(Ok(url.clone()));
                }
                let handle = nav_app.clone();
                // Close outside the navigation callback to avoid re-entrancy.
                std::thread::spawn(move || {
                    if let Some(w) = handle.get_webview_window(LOGIN_LABEL) {
                        let _ = w.close();
                    }
                });
                return false; // cancel navigation to the custom scheme
            }
            true // let the full Microsoft / Magister redirect chain run
        })
        .build()
        .map_err(|e| format!("Could not open login window: {e}"))?;

    let close_tx = tx.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            if let Some(sender) = close_tx.lock().unwrap().take() {
                let _ = sender.send(Err("Login window was closed".into()));
            }
        }
    });

    let redirect = rx.await.map_err(|_| "Login cancelled".to_string())??;

    if let Some(err) = param(&redirect, "error") {
        return Err(format!("Magister login failed: {err}"));
    }
    if param(&redirect, "state").as_deref() != Some(state.as_str()) {
        return Err("State mismatch in login response".into());
    }
    let code = param(&redirect, "code").ok_or("No authorization code in login response")?;

    exchange_code(&code, &verifier).await
}

async fn exchange_code(code: &str, verifier: &str) -> Result<Tokens, String> {
    let res = reqwest::Client::new()
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", CLIENT_ID),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("Token request failed: {e}"))?;
    parse_tokens(res).await
}

/// Gemairo refresh: grant_type=refresh_token with the same client id.
pub async fn refresh(refresh_token: &str) -> Result<Tokens, String> {
    let res = reqwest::Client::new()
        .post(TOKEN_URL)
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", CLIENT_ID),
        ])
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {e}"))?;
    parse_tokens(res).await
}

async fn parse_tokens(res: reqwest::Response) -> Result<Tokens, String> {
    let status = res.status();
    let body = res.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Token endpoint returned {status}: {body}"));
    }
    serde_json::from_str(&body).map_err(|e| format!("Invalid token response: {e}"))
}

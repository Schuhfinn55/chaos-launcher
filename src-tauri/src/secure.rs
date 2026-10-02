//! Chaos Launcher - Verschlüsselung sensibler Daten
//!
//! Microsoft-/Minecraft-Tokens werden nie im Klartext gespeichert.
//! Unter Windows nutzen wir die Data Protection API (DPAPI): die
//! Daten lassen sich nur vom selben Windows-Benutzer auf demselben
//! PC wieder entschlüsseln. Gespeichert wird `dpapi:<base64>`.
//!
//! Auf anderen Plattformen (Dev-Builds) wird ein klar erkennbares
//! `plain:`-Präfix verwendet, damit nichts stillschweigend unsicher
//! ist.

use base64::{engine::general_purpose::STANDARD as B64, Engine};

const DPAPI_PREFIX: &str = "dpapi:";
const PLAIN_PREFIX: &str = "plain:";

/// Verschlüsselt einen Klartext für die Speicherung.
pub fn protect(plain: &str) -> Result<String, String> {
    if plain.is_empty() {
        return Ok(String::new());
    }
    #[cfg(windows)]
    {
        let bytes = dpapi_protect(plain.as_bytes())?;
        Ok(format!("{DPAPI_PREFIX}{}", B64.encode(bytes)))
    }
    #[cfg(not(windows))]
    {
        Ok(format!("{PLAIN_PREFIX}{}", B64.encode(plain.as_bytes())))
    }
}

/// Entschlüsselt einen gespeicherten Wert. Klartext-Werte (alte
/// Dateien ohne Präfix) werden unverändert zurückgegeben, damit die
/// Migration beim nächsten Speichern automatisch passiert.
pub fn unprotect(stored: &str) -> Result<String, String> {
    if stored.is_empty() {
        return Ok(String::new());
    }
    if let Some(b64) = stored.strip_prefix(DPAPI_PREFIX) {
        let bytes = B64.decode(b64).map_err(|e| format!("Token-Base64: {e}"))?;
        #[cfg(windows)]
        {
            let plain = dpapi_unprotect(&bytes)?;
            return String::from_utf8(plain).map_err(|e| format!("Token-UTF8: {e}"));
        }
        #[cfg(not(windows))]
        {
            return Err("DPAPI-Daten können nur unter Windows entschlüsselt werden.".to_string());
        }
    }
    if let Some(b64) = stored.strip_prefix(PLAIN_PREFIX) {
        let bytes = B64.decode(b64).map_err(|e| format!("Token-Base64: {e}"))?;
        return String::from_utf8(bytes).map_err(|e| format!("Token-UTF8: {e}"));
    }
    // Altbestand: Klartext
    Ok(stored.to_string())
}

/// Ist der Wert bereits verschlüsselt gespeichert?
pub fn is_protected(stored: &str) -> bool {
    stored.is_empty() || stored.starts_with(DPAPI_PREFIX) || stored.starts_with(PLAIN_PREFIX)
}

#[cfg(windows)]
fn dpapi_protect(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN};

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptProtectData(
            &mut input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|e| format!("DPAPI protect: {e}"))?;
        let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let out = slice.to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(out)
    }
}

#[cfg(windows)]
fn dpapi_unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN};

    let mut input = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB::default();
    unsafe {
        CryptUnprotectData(
            &mut input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
        .map_err(|e| format!("DPAPI unprotect: {e}"))?;
        let slice = std::slice::from_raw_parts(output.pbData, output.cbData as usize);
        let out = slice.to_vec();
        let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
        Ok(out)
    }
}

/// Kürzt einen Token für Log-Ausgaben (nie den ganzen Wert loggen).
pub fn redact(token: &str) -> String {
    if token.len() <= 8 {
        return "***".to_string();
    }
    format!("{}…{}", &token[..4], &token[token.len() - 2..])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_protect_unprotect() {
        let secret = "eyJhbGciOi...sehr-geheimer-token";
        let stored = protect(secret).expect("protect");
        assert!(is_protected(&stored));
        assert_ne!(stored, secret, "Token darf nicht im Klartext gespeichert werden");
        assert!(!stored.contains("geheimer"), "verschlüsselter Wert enthält Klartext");
        let back = unprotect(&stored).expect("unprotect");
        assert_eq!(back, secret);
    }

    #[test]
    fn legacy_plaintext_is_accepted() {
        assert_eq!(unprotect("plain-old-token").unwrap(), "plain-old-token");
        assert!(!is_protected("plain-old-token"));
        assert_eq!(protect("").unwrap(), "");
    }

    #[test]
    fn redact_hides_token() {
        let r = redact("abcdefghijklmnop");
        assert!(r.starts_with("abcd") && r.ends_with("op") && !r.contains("efgh"));
    }
}

//! Chaos Launcher - Serverstatus (Server List Ping)
//!
//! Implementiert das Minecraft-Protokoll für die Statusabfrage:
//!   1. Handshake (Packet 0x00, next state = 1)
//!   2. Status Request (0x00) → JSON mit Version, Spielern, MOTD
//!   3. Ping (0x01) mit Zeitstempel → Latenz
//!
//! Referenz: https://minecraft.wiki/w/Java_Edition_protocol/Server_List_Ping

use crate::models::ServerStatus;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

const TIMEOUT: Duration = Duration::from_secs(5);

/// Zerlegt "host:port" in Host und Port (Standard 25565).
pub fn parse_address(input: &str) -> (String, u16) {
    let s = input.trim();
    if let Some((h, p)) = s.rsplit_once(':') {
        if let Ok(port) = p.parse::<u16>() {
            return (h.to_string(), port);
        }
    }
    (s.to_string(), 25565)
}

/// Fragt den Status eines Servers ab. Liefert immer ein Ergebnis;
/// bei Fehlern ist `online = false` und `error` gesetzt.
pub async fn ping(address: &str) -> ServerStatus {
    let (host, port) = parse_address(address);
    let mut status = ServerStatus {
        address: host.clone(),
        port,
        checked_at: crate::system::now_secs(),
        ..Default::default()
    };
    match tokio::time::timeout(TIMEOUT, ping_inner(&host, port)).await {
        Ok(Ok((json, latency))) => {
            status.online = true;
            status.latency_ms = latency;
            apply_json(&mut status, &json);
        }
        Ok(Err(e)) => status.error = Some(e),
        Err(_) => status.error = Some("Zeitüberschreitung".to_string()),
    }
    status
}

async fn ping_inner(host: &str, port: u16) -> Result<(serde_json::Value, u32), String> {
    let mut stream = TcpStream::connect((host, port))
        .await
        .map_err(|e| format!("Verbindung: {e}"))?;
    stream.set_nodelay(true).ok();

    // ---- Handshake ----
    let mut hs: Vec<u8> = Vec::new();
    write_varint(&mut hs, 0x00); // Packet-ID
    write_varint(&mut hs, -1); // Protokoll-Version (-1 = Status-Abfrage)
    write_string(&mut hs, host);
    hs.extend_from_slice(&port.to_be_bytes());
    write_varint(&mut hs, 1); // Next state: Status
    send_packet(&mut stream, &hs).await?;

    // ---- Status Request ----
    let mut req: Vec<u8> = Vec::new();
    write_varint(&mut req, 0x00);
    send_packet(&mut stream, &req).await?;

    // ---- Status Response ----
    let payload = read_packet(&mut stream).await?;
    let mut cursor = 0usize;
    let packet_id = read_varint_buf(&payload, &mut cursor)?;
    if packet_id != 0x00 {
        return Err(format!("Unerwartete Paket-ID {packet_id}"));
    }
    let json_len = read_varint_buf(&payload, &mut cursor)? as usize;
    if cursor + json_len > payload.len() {
        return Err("Status-JSON unvollständig".to_string());
    }
    let json_str = std::str::from_utf8(&payload[cursor..cursor + json_len])
        .map_err(|e| format!("Status-UTF8: {e}"))?;
    let json: serde_json::Value =
        serde_json::from_str(json_str).map_err(|e| format!("Status-JSON: {e}"))?;

    // ---- Ping ----
    let latency = {
        let mut p: Vec<u8> = Vec::new();
        write_varint(&mut p, 0x01);
        let now = Instant::now();
        p.extend_from_slice(&0i64.to_be_bytes());
        send_packet(&mut stream, &p).await?;
        match tokio::time::timeout(Duration::from_secs(2), read_packet(&mut stream)).await {
            Ok(Ok(_)) => now.elapsed().as_millis() as u32,
            _ => 0,
        }
    };

    Ok((json, latency))
}

fn apply_json(status: &mut ServerStatus, json: &serde_json::Value) {
    if let Some(v) = json.get("version") {
        status.version = v.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
        status.protocol = v.get("protocol").and_then(|p| p.as_i64()).unwrap_or(0);
    }
    if let Some(p) = json.get("players") {
        status.players_online = p.get("online").and_then(|n| n.as_u64()).unwrap_or(0) as u32;
        status.players_max = p.get("max").and_then(|n| n.as_u64()).unwrap_or(0) as u32;
        if let Some(sample) = p.get("sample").and_then(|s| s.as_array()) {
            status.sample = sample
                .iter()
                .filter_map(|e| e.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                .collect();
        }
    }
    if let Some(d) = json.get("description") {
        status.motd = flatten_chat(d);
    }
    if let Some(f) = json.get("favicon").and_then(|f| f.as_str()) {
        status.favicon = Some(f.to_string());
    }
}

/// Wandelt eine Chat-Komponente (String oder JSON-Objekt) in reinen
/// Text um und entfernt §-Formatierungscodes.
pub fn flatten_chat(v: &serde_json::Value) -> String {
    fn walk(v: &serde_json::Value, out: &mut String) {
        match v {
            serde_json::Value::String(s) => out.push_str(s),
            serde_json::Value::Array(arr) => arr.iter().for_each(|x| walk(x, out)),
            serde_json::Value::Object(o) => {
                if let Some(t) = o.get("text").and_then(|t| t.as_str()) {
                    out.push_str(t);
                }
                if let Some(extra) = o.get("extra") {
                    walk(extra, out);
                }
            }
            _ => {}
        }
    }
    let mut out = String::new();
    walk(v, &mut out);
    strip_section_codes(&out)
}

fn strip_section_codes(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(c) = chars.next() {
        if c == '§' {
            chars.next();
        } else {
            out.push(c);
        }
    }
    out.trim().to_string()
}

/* ---------- Protokoll-Helfer ---------- */

fn write_varint(buf: &mut Vec<u8>, value: i32) {
    let mut v = value as u32;
    loop {
        let mut byte = (v & 0x7F) as u8;
        v >>= 7;
        if v != 0 {
            byte |= 0x80;
        }
        buf.push(byte);
        if v == 0 {
            break;
        }
    }
}

fn write_string(buf: &mut Vec<u8>, s: &str) {
    write_varint(buf, s.len() as i32);
    buf.extend_from_slice(s.as_bytes());
}

async fn send_packet(stream: &mut TcpStream, payload: &[u8]) -> Result<(), String> {
    let mut framed: Vec<u8> = Vec::with_capacity(payload.len() + 5);
    write_varint(&mut framed, payload.len() as i32);
    framed.extend_from_slice(payload);
    stream.write_all(&framed).await.map_err(|e| format!("Senden: {e}"))?;
    Ok(())
}

async fn read_varint_stream(stream: &mut TcpStream) -> Result<i32, String> {
    let mut result: i32 = 0;
    for i in 0..5 {
        let b = stream.read_u8().await.map_err(|e| format!("Lesen: {e}"))?;
        result |= ((b & 0x7F) as i32) << (7 * i);
        if b & 0x80 == 0 {
            return Ok(result);
        }
    }
    Err("VarInt zu lang".to_string())
}

fn read_varint_buf(buf: &[u8], cursor: &mut usize) -> Result<i32, String> {
    let mut result: i32 = 0;
    for i in 0..5 {
        let b = *buf.get(*cursor).ok_or("VarInt unvollständig")?;
        *cursor += 1;
        result |= ((b & 0x7F) as i32) << (7 * i);
        if b & 0x80 == 0 {
            return Ok(result);
        }
    }
    Err("VarInt zu lang".to_string())
}

async fn read_packet(stream: &mut TcpStream) -> Result<Vec<u8>, String> {
    let len = read_varint_stream(stream).await? as usize;
    if len > 4 * 1024 * 1024 {
        return Err("Paket zu groß".to_string());
    }
    let mut buf = vec![0u8; len];
    stream.read_exact(&mut buf).await.map_err(|e| format!("Lesen: {e}"))?;
    Ok(buf)
}

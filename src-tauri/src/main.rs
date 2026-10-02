// Onyx Launcher - Binär-Einstiegspunkt (Windows)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    onyx_launcher_lib::run()
}

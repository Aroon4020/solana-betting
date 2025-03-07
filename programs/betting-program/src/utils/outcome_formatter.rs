pub fn format_outcome(outcome: &str) -> [u8; 20] {
    let mut fixed = [b' '; 20];
    let bytes = outcome.as_bytes();
    let len = if bytes.len() > 20 { 20 } else { bytes.len() };
    fixed[..len].copy_from_slice(&bytes[..len]);
    fixed
}

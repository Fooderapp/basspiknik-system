# Apple Wallet Certificates

Place these files here (never commit them — add to .gitignore):

## Files needed

- `signerCert.pem` — your Pass Type ID certificate
- `signerKey.pem`  — private key for the certificate
- `wwdr.pem`       — Apple WWDR intermediate certificate

## Setup steps

1. **Apple Developer Portal** → Certificates, IDs & Profiles → Identifiers → Pass Type IDs
2. Create new: `pass.com.eventos.mobile.ticket`
3. Create certificate for that Pass Type ID, download it (`.cer`)
4. Double-click to install in Keychain Access
5. Export from Keychain as `.p12` (set a passphrase, store it as `WALLET_PASS_PHRASE` env var)
6. Convert to PEM:
   ```bash
   openssl pkcs12 -in certificate.p12 -clcerts -nokeys -out signerCert.pem
   openssl pkcs12 -in certificate.p12 -nocerts -out signerKey.pem
   ```
7. Download WWDR cert from Apple:
   ```bash
   curl -o wwdr.pem https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
   openssl x509 -inform DER -in wwdr.pem -out wwdr.pem
   ```

## Environment variables (add to Vercel)

```
WALLET_PASS_TYPE_ID=pass.com.eventos.mobile.ticket
APPLE_TEAM_ID=YOUR_TEAM_ID
WALLET_PASS_PHRASE=your_p12_export_passphrase
```

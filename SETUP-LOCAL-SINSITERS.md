# SINISTERS local setup (Windows RDP)

## 1. Install dependencies
Open CMD in this folder and run:

```bat
npm install
```

## 2. Configure Gmail OTP
Copy `.env.example` to a new file named `.env` in this same folder. Edit `.env` and set:

- `APP_USERNAME` and `APP_PASSWORD`: the bootstrap admin login you intend to use.
- `SECRET_KEY`: a long random secret (do not publish it).
- `GMAIL_USER`: the Gmail address that sends verification messages.
- `GMAIL_APP_PASSWORD`: a Google App Password for that Gmail account (not the normal Gmail password).
- `GMAIL_FROM`: the same Gmail address. Messages display the sender name `SINISTERS Panel`.
- `PORT=3000`

Enable 2-Step Verification on the sending Google account and generate an App Password at https://myaccount.google.com/apppasswords. The app cannot send OTP until these credentials are valid. Never share or commit `.env`.

## 3. Start the app

```bat
node server.js
```

Keep the terminal open and visit http://localhost:3000 on the RDP.

## Notes
- Registration passwords may be 1–128 characters; use a strong password even though there is no 10-character minimum.
- OTP expires in 10 minutes and is limited to five verification attempts.
- Email-verified registrations remain pending until an admin approves them.
- If email sending fails, check `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_FROM`, and the server terminal's `Registration email error` line. Do not run `npm audit fix --force` as a first troubleshooting step.

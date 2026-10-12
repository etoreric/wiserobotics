# Wise Robotic & STEM

## Run locally

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000>. The first visit to `/admin/login` asks you to create an administrator password. Use at least 12 characters. The dashboard is available at <http://127.0.0.1:5000/admin>.

The app stores site copy and media assignments in `site.db`; uploaded image and video files are saved in `assets/uploads/`. Back up both when moving the site. Set `FLASK_SECRET_KEY` in the environment when deploying behind a public domain, and serve the app over HTTPS. The development server binds to localhost only.

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

## Deploy to Render

Create a Blueprint in Render and connect this repository. [`render.yaml`](render.yaml) configures the Free web service, installs dependencies from `requirements.txt`, starts the app with Gunicorn, and generates a Flask session secret.

For an existing Render web service, set **Build Command** to `pip install -r requirements.txt` and **Start Command** to `gunicorn app:app --bind 0.0.0.0:$PORT` in the service's Settings. Then redeploy. The `python app.py` fallback also binds to Render's public interface, but uses Flask's development server.

**Free-tier storage is temporary.** Render can discard `site.db` and files uploaded to `assets/uploads/` when the service restarts, redeploys, or spins down. That also resets the admin password and content edits. Use this setup for a preview; persistent CMS data requires a paid service with a persistent disk.

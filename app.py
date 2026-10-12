import hmac
import json
import os
import re
import secrets
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import unquote

from flask import Flask, abort, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename


ROOT = Path(__file__).resolve().parent
ASSET_DIR = ROOT / "assets"
IMAGE_DIR = ASSET_DIR / "img"
UPLOAD_DIR = ASSET_DIR / "uploads"
DATABASE = ROOT / "site.db"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".webm"}
app = Flask(__name__, static_folder=str(ASSET_DIR), static_url_path="/assets")
app.config.update(
    MAX_CONTENT_LENGTH=200 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)


def connect_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


@contextmanager
def db_connection():
    connection = connect_db()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def read_setting(connection, key, default=None):
    row = connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def write_setting(connection, key, value):
    connection.execute(
        "INSERT INTO settings(key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, json.dumps(value, ensure_ascii=True)),
    )


def init_db():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with db_connection() as connection:
        connection.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        connection.execute(
            "CREATE TABLE IF NOT EXISTS media ("
            "id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, "
            "kind TEXT NOT NULL, created_at TEXT NOT NULL)"
        )
        if not read_setting(connection, "secret_key"):
            write_setting(connection, "secret_key", secrets.token_hex(32))
        if read_setting(connection, "content") is None:
            write_setting(connection, "content", {"text": {}, "images": {}, "videos": [], "title": ""})
        connection.commit()
        app.secret_key = os.environ.get("FLASK_SECRET_KEY") or read_setting(connection, "secret_key")


def get_content(connection=None):
    owns_connection = connection is None
    connection = connection or connect_db()
    content = read_setting(connection, "content", {"text": {}, "images": {}, "videos": [], "title": ""})
    if owns_connection:
        connection.close()
    return content


def set_content(connection, content):
    write_setting(connection, "content", content)
    connection.commit()


def csrf_value():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


def valid_csrf():
    supplied = request.headers.get("X-CSRF-Token") or request.form.get("csrf_token")
    expected = session.get("csrf", "")
    return bool(supplied and expected and hmac.compare_digest(supplied, expected))


def csrf_required():
    if not valid_csrf():
        abort(400, description="Your session expired. Refresh the page and try again.")


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin"):
            if request.path.startswith("/admin/api/"):
                return jsonify(error="Please sign in again."), 401
            return redirect(url_for("admin_login"))
        return view(*args, **kwargs)
    return wrapped


def asset_records():
    records = []
    for folder, prefix in ((IMAGE_DIR, "/assets/img/"), (UPLOAD_DIR, "/assets/uploads/")):
        if not folder.exists():
            continue
        for path in sorted(folder.iterdir(), key=lambda item: item.name.casefold()):
            extension = path.suffix.lower()
            if not path.is_file():
                continue
            if extension in IMAGE_EXTENSIONS:
                kind = "image"
            elif extension in VIDEO_EXTENSIONS:
                kind = "video"
            else:
                continue
            records.append({"name": path.name, "path": prefix + path.name, "kind": kind,
                            "system": folder == IMAGE_DIR})
    return records


def valid_image_path(path):
    return isinstance(path, str) and (
        path.startswith("https://") or any(
            item["path"] == unquote(path) and item["kind"] == "image" for item in asset_records()
        )
    )


def media_for_path(path):
    with db_connection() as connection:
        return connection.execute("SELECT * FROM media WHERE path = ?", (path,)).fetchone()


def text_content(value, limit=5000):
    return isinstance(value, str) and len(value) <= limit


@app.errorhandler(413)
def file_too_large(_error):
    return jsonify(error="The upload is larger than the 200 MB limit."), 413


@app.errorhandler(400)
def bad_request(error):
    if request.path.startswith("/admin/api/"):
        return jsonify(error=getattr(error, "description", "Invalid request.")), 400
    return getattr(error, "description", "Invalid request."), 400


@app.get("/")
def home():
    return send_from_directory(ROOT, "index.html")


@app.get("/about")
@app.get("/programs")
@app.get("/student-life")
@app.get("/why-us")
@app.get("/videos")
@app.get("/contact")
def site_page():
    return send_from_directory(ROOT, "index.html")


@app.get("/api/site-content")
def public_content():
    content = get_content()
    return jsonify({key: content.get(key, fallback) for key, fallback in {
        "text": {}, "images": {}, "videos": [], "title": ""
    }.items()})


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    with db_connection() as connection:
        password_hash = read_setting(connection, "admin_password")
    is_setup = password_hash is None
    error = None
    if request.method == "POST":
        csrf_required()
        password = request.form.get("password", "")
        if is_setup:
            confirmation = request.form.get("confirm_password", "")
            if len(password) < 12:
                error = "Use a password with at least 12 characters."
            elif password != confirmation:
                error = "The passwords do not match."
            else:
                with db_connection() as connection:
                    write_setting(connection, "admin_password", generate_password_hash(password))
                    connection.commit()
                session.clear()
                session["admin"] = True
                csrf_value()
                return redirect(url_for("admin_dashboard"))
        elif password_hash and check_password_hash(password_hash, password):
            session.clear()
            session["admin"] = True
            csrf_value()
            return redirect(url_for("admin_dashboard"))
        else:
            error = "That password did not match."
    return render_template("auth.html", setup=is_setup, error=error, csrf_token=csrf_value())


@app.post("/admin/logout")
@admin_required
def admin_logout():
    csrf_required()
    session.clear()
    return redirect(url_for("admin_login"))


@app.get("/admin")
@admin_required
def admin_dashboard():
    return render_template("admin.html", csrf_token=csrf_value())


@app.get("/admin/api/source")
@admin_required
def admin_source():
    return send_from_directory(ROOT, "index.html", mimetype="text/html")


@app.route("/admin/api/content", methods=["GET", "PUT"])
@admin_required
def admin_content():
    if request.method == "GET":
        return jsonify(get_content())
    csrf_required()
    payload = request.get_json(silent=True) or {}
    text = payload.get("text", {})
    images = payload.get("images", {})
    title = payload.get("title", "")
    if not isinstance(text, dict) or not isinstance(images, dict) or not text_content(title, 300):
        return jsonify(error="The content payload is invalid."), 400
    if len(text) > 1500 or len(images) > 1000:
        return jsonify(error="The content payload is too large."), 400
    clean_text = {}
    for key, value in text.items():
        if re.fullmatch(r"text-\d+", key) and text_content(value):
            clean_text[key] = value
    clean_images = {}
    for key, value in images.items():
        if not re.fullmatch(r"image-\d+", key) or not isinstance(value, dict):
            continue
        source = value.get("src", "")
        alt = value.get("alt", "")
        if (source and not valid_image_path(source)) or not text_content(alt, 1000):
            return jsonify(error="An image or its description is invalid."), 400
        clean_images[key] = {"src": source, "alt": alt}
    with db_connection() as connection:
        previous = get_content(connection)
        updated = {**previous, "text": clean_text, "images": clean_images, "title": title}
        set_content(connection, updated)
    return jsonify(ok=True)


@app.get("/admin/api/media")
@admin_required
def admin_media():
    with db_connection() as connection:
        uploaded = [dict(row) for row in connection.execute(
            "SELECT id, name, path, kind, created_at FROM media ORDER BY created_at DESC"
        ).fetchall()]
    system = [item for item in asset_records() if item["system"]]
    return jsonify(system + uploaded)


@app.post("/admin/api/media")
@admin_required
def upload_media():
    csrf_required()
    uploaded_file = request.files.get("file")
    if not uploaded_file or not uploaded_file.filename:
        return jsonify(error="Choose an image or video to upload."), 400
    original_name = secure_filename(uploaded_file.filename)
    extension = Path(original_name).suffix.lower()
    if extension not in IMAGE_EXTENSIONS | VIDEO_EXTENSIONS:
        return jsonify(error="Use JPG, PNG, GIF, WebP, MP4, or WebM files."), 400
    kind = "image" if extension in IMAGE_EXTENSIONS else "video"
    media_id = uuid.uuid4().hex
    stored_name = media_id + extension
    destination = UPLOAD_DIR / stored_name
    uploaded_file.save(destination)
    media_path = "/assets/uploads/" + stored_name
    with db_connection() as connection:
        connection.execute(
            "INSERT INTO media(id, name, path, kind, created_at) VALUES (?, ?, ?, ?, ?)",
            (media_id, original_name or stored_name, media_path, kind,
             datetime.now(timezone.utc).isoformat()),
        )
        connection.commit()
    return jsonify({"id": media_id, "name": original_name, "path": media_path, "kind": kind}), 201


@app.delete("/admin/api/media/<media_id>")
@admin_required
def delete_media(media_id):
    csrf_required()
    with db_connection() as connection:
        row = connection.execute("SELECT * FROM media WHERE id = ?", (media_id,)).fetchone()
        if not row:
            return jsonify(error="Uploaded media not found."), 404
        content = get_content(connection)
        in_use = any(image.get("src") == row["path"] for image in content.get("images", {}).values())
        in_use = in_use or any(
            video.get("src") == row["path"] or video.get("poster") == row["path"]
            for video in content.get("videos", [])
        )
        if in_use:
            return jsonify(error="This file is assigned to page content. Remove those assignments first."), 409
        file_path = UPLOAD_DIR / Path(row["path"]).name
        connection.execute("DELETE FROM media WHERE id = ?", (media_id,))
        connection.commit()
    file_path.unlink(missing_ok=True)
    return jsonify(ok=True)


@app.route("/admin/api/videos", methods=["GET", "POST"])
@admin_required
def admin_videos():
    with db_connection() as connection:
        content = get_content(connection)
        if request.method == "GET":
            return jsonify(content.get("videos", []))
        csrf_required()
        payload = request.get_json(silent=True) or {}
        title = payload.get("title", "").strip() if isinstance(payload.get("title"), str) else ""
        description = payload.get("description", "").strip() if isinstance(payload.get("description"), str) else ""
        source = payload.get("src", "")
        poster = payload.get("poster", "")
        row = media_for_path(source)
        if (not title or not text_content(title, 200) or not text_content(description, 1000)
                or not row or row["kind"] != "video"):
            return jsonify(error="Add a title, description, and uploaded video file."), 400
        if poster and not valid_image_path(poster):
            return jsonify(error="Choose a valid poster image."), 400
        video = {"id": uuid.uuid4().hex, "title": title, "description": description,
                 "src": source, "poster": poster}
        content["videos"] = content.get("videos", []) + [video]
        set_content(connection, content)
    return jsonify(video), 201


@app.route("/admin/api/videos/<video_id>", methods=["PUT", "DELETE"])
@admin_required
def edit_video(video_id):
    csrf_required()
    with db_connection() as connection:
        content = get_content(connection)
        videos = content.get("videos", [])
        video = next((item for item in videos if item.get("id") == video_id), None)
        if not video:
            return jsonify(error="Video not found."), 404
        if request.method == "DELETE":
            content["videos"] = [item for item in videos if item.get("id") != video_id]
        else:
            payload = request.get_json(silent=True) or {}
            title = payload.get("title", "").strip() if isinstance(payload.get("title"), str) else ""
            description = payload.get("description", "").strip() if isinstance(payload.get("description"), str) else ""
            poster = payload.get("poster", "")
            if not title or not text_content(title, 200) or not text_content(description, 1000):
                return jsonify(error="Add a title and a description under 1,000 characters."), 400
            if poster and not valid_image_path(poster):
                return jsonify(error="Choose a valid poster image."), 400
            video.update(title=title, description=description, poster=poster)
        set_content(connection, content)
    return jsonify(ok=True)


init_db()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=False)

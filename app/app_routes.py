from flask import render_template

from app import app

@app.route('/')
def home():
  return render_template('main.html', title="Home", content="Hello, World!")
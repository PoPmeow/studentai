"""Vercel serverless entrypoint.

Vercel's @vercel/python builder serves the ASGI `app` exported here.
We just re-export the FastAPI app defined in server.py at the repo root.
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from server import app  # noqa: E402,F401

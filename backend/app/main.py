import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from .routers import auth, comments, movies, oauth_token, stream, users
from .services import streaming
from .services.users import avatars_dir

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx logs full request URLs at INFO level, which would expose API keys sent as query parameters.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = streaming.init_engine()
    cleanup = asyncio.create_task(streaming.cleanup_loop())
    yield
    cleanup.cancel()
    await engine.stop()


app = FastAPI(
    title="Hypertube API",
    version="1.0.0",
    description="RESTful API of Hypertube. Obtain a token with POST /api/oauth/token, "
                "then send it as `Authorization: Bearer <token>`.",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

for r in (auth.router, oauth_token.router, users.router, movies.router, comments.router, stream.router):
    app.include_router(r)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse({"detail": "Validation failed.", "errors": errors}, status_code=422)


@app.get("/api/media/avatars/{name}", include_in_schema=False)
def avatar(name: str):
    import re
    if not re.match(r"^[A-Za-z0-9_-]+\.webp$", name):
        raise HTTPException(404)
    path = avatars_dir() / name
    if not path.is_file():
        raise HTTPException(404)
    return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/health", include_in_schema=False)
def health():
    return {"status": "ok"}

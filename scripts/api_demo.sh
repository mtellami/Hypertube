#!/usr/bin/env sh
# Walk through the Hypertube REST API (useful during the evaluation).
# Usage: ./scripts/api_demo.sh <username> <password> [base_url]
#   or:  CLIENT_ID=... CLIENT_SECRET=... ./scripts/api_demo.sh
# Requires curl; pretty-prints with python3 when available.
set -eu

BASE="${3:-${BASE_URL:-http://localhost:8080/api}}"
pp() { if command -v python3 >/dev/null 2>&1; then python3 -m json.tool 2>/dev/null || cat; else cat; fi; }
show() { printf '\n\033[1;33m$ %s\033[0m\n' "$*"; }

show "POST $BASE/oauth/token"
if [ -n "${CLIENT_ID:-}" ]; then
  TOKEN_JSON=$(curl -s -X POST "$BASE/oauth/token" -d grant_type=client_credentials \
    -d "client_id=$CLIENT_ID" -d "client_secret=$CLIENT_SECRET")
else
  TOKEN_JSON=$(curl -s -X POST "$BASE/oauth/token" -d grant_type=password -d "username=$1" -d "password=$2")
fi
echo "$TOKEN_JSON" | pp
TOKEN=$(echo "$TOKEN_JSON" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
[ -n "$TOKEN" ] || { echo "No token obtained"; exit 1; }
AUTH="Authorization: Bearer $TOKEN"

show "GET $BASE/movies   (public front page, no token)"
curl -s "$BASE/movies" | head -c 600; echo " ..."
MOVIE_ID=$(curl -s "$BASE/movies" | sed -n 's/^\[{"id":\([0-9]*\).*/\1/p')

show "GET $BASE/movies/$MOVIE_ID"
curl -s -H "$AUTH" "$BASE/movies/$MOVIE_ID" | pp

show "GET $BASE/users"
curl -s -H "$AUTH" "$BASE/users" | pp

show "GET $BASE/users/1"
curl -s -H "$AUTH" "$BASE/users/1" | pp

OTHER="${OTHER_USER_ID:-2}"
show "PATCH $BASE/users/$OTHER   (another user's profile -> 403)"
curl -s -w "\nHTTP %{http_code}\n" -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"username":"hacker"}' "$BASE/users/$OTHER"

show "POST $BASE/movies/$MOVIE_ID/comments"
COMMENT=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"comment":"Posted from the REST API"}' "$BASE/movies/$MOVIE_ID/comments")
echo "$COMMENT" | pp
COMMENT_ID=$(echo "$COMMENT" | sed -n 's/^{"id":\([0-9]*\).*/\1/p')

show "POST $BASE/comments"
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"comment\":\"Second comment\",\"movie_id\":$MOVIE_ID}" "$BASE/comments" | pp

show "GET $BASE/comments"
curl -s -H "$AUTH" "$BASE/comments" | head -c 600; echo " ..."

show "GET $BASE/movies/$MOVIE_ID/comments"
curl -s -H "$AUTH" "$BASE/movies/$MOVIE_ID/comments" | head -c 600; echo " ..."

show "PATCH $BASE/comments/$COMMENT_ID"
curl -s -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"comment":"Edited through the API"}' "$BASE/comments/$COMMENT_ID" | pp

show "GET $BASE/comments/$COMMENT_ID"
curl -s -H "$AUTH" "$BASE/comments/$COMMENT_ID" | pp

show "DELETE $BASE/comments/$COMMENT_ID"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X DELETE -H "$AUTH" "$BASE/comments/$COMMENT_ID"

show "GET $BASE/users   (no token)"
curl -s -o /dev/null -w "HTTP %{http_code}\n" "$BASE/users"

show "DELETE $BASE/movies/$MOVIE_ID   (not part of the API)"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -X DELETE -H "$AUTH" "$BASE/movies/$MOVIE_ID"

show "GET $BASE/unknown"
curl -s -o /dev/null -w "HTTP %{http_code}\n" -H "$AUTH" "$BASE/unknown"

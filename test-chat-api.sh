#!/bin/bash
TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI0ZmQyOWY2MC0zZmFhLTQyNjItOTAxMy0yNzkzODgxZDg1YzEiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoidXNlciIsImlhdCI6MTc2MjE5NjU0MSwiZXhwIjoxNzYyODAxMzQxfQ.4hIv2y_pOU35tk_1Rl3-51NmwT4sFrcUfkrFZobw9CE'

curl -X POST http://localhost:8083/api/v2/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Merhaba test","model":"anthropic/claude-3-5-sonnet-20241022"}' \
  2>&1 | head -30

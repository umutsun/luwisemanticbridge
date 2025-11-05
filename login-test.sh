#!/bin/bash
curl -X POST http://localhost:8083/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  2>&1

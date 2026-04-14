# API Contract (MVP)

All endpoints require Cognito Bearer token.

## Artists
- `GET /artists`
- `GET /artists/{id}`
- `POST /artists`
  - body: `{ "stageName": "Azawi", "legalName": "...", "commissionRate": 20, "managerId": "..." }`
- `PUT /artists/{id}`
- `DELETE /artists/{id}` (Admin)

## Tasks
- `GET /artists/{id}/tasks`
- `GET /tasks/me`
- `POST /tasks`
  - body: `{ "artistId": "uuid", "title": "Book interview", "dueDate": "2026-04-20", "assignedTo": "userSub" }`
- `PATCH /tasks/{id}`

## Transactions
- `GET /artists/{id}/transactions`
- `POST /transactions`
  - body: `{ "artistId": "uuid", "type": "income", "amount": 1500000, "date": "2026-04-01", "category": "Show", "notes": "..." }`

## Dashboard
- `GET /dashboard`

## Uploads
- `POST /uploads/presign`
  - body: `{ "artistId": "uuid", "type": "contracts", "ext": "pdf", "contentType": "application/pdf" }`
  - response: `{ "uploadUrl": "...", "key": "...", "fileUrl": "s3://..." }`

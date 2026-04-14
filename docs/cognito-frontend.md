# Frontend Cognito Integration (Recommended)

Use `aws-amplify` in the frontend to manage login and tokens, then store the access token in `useAuthStore`.

## Install
```bash
cd frontend
npm install aws-amplify
```

## Minimal Setup
```ts
import { Amplify } from "aws-amplify";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID
    }
  }
});
```

On sign-in success:
1. Read access token from Amplify session.
2. Call `useAuthStore.getState().setSession(...)`.
3. API client automatically attaches `Authorization` header.

export const config = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "",
  region: import.meta.env.VITE_AWS_REGION ?? "",
  cognitoUserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "",
  cognitoClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? ""
};

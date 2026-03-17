export type UserRole = "Admin" | "Finance" | "Operations" | "Viewer";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
}

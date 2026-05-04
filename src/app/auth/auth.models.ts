export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

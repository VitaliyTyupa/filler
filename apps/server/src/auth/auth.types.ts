export interface AuthUser {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
}

export interface AuthPayload {
  sub: string;
  username: string;
}

export interface AuthResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
  };
}

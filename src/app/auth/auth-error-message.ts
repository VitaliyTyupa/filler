export function localizeAuthErrorMessage(message: string | undefined, fallback: string): string {
  switch (message) {
    case 'Username is already taken':
      return $localize`:@@authErrorUsernameTaken:Це ім'я користувача вже зайняте`;
    case 'Invalid credentials':
      return $localize`:@@authErrorInvalidCredentials:Невірні облікові дані`;
    case 'Username must be between 3 and 30 characters':
      return $localize`:@@authErrorUsernameLength:Ім'я користувача має містити від 3 до 30 символів`;
    case 'Password must be between 6 and 128 characters':
      return $localize`:@@authErrorPasswordLength:Пароль має містити від 6 до 128 символів`;
    default:
      return message || fallback;
  }
}

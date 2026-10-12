// The Security Issues Analytics login. Used by the sign-in screen and by the UberTicket monitor's
// Settings (changing the UberTicket token requires the same username and password).
export const APP_LOGIN_USERNAME = 'csdatasec';
export const APP_LOGIN_PASSWORD = 'CSd4t4s3c!';

export function isValidAppLogin(username: string, password: string): boolean {
  return String(username).trim().toLowerCase() === APP_LOGIN_USERNAME.toLowerCase()
    && String(password).trim() === APP_LOGIN_PASSWORD;
}

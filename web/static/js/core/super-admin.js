export const SUPER_ADMIN_USER_IDS = ["u01"];
export const SUPER_ADMIN_USER_NAMES = ["김기획"];

export function isSuperAdminUser(user){
  if(!user) return false;
  return SUPER_ADMIN_USER_IDS.includes(user.id) || SUPER_ADMIN_USER_NAMES.includes(user.name);
}

// src/utils/roles.js

export const ROLES = Object.freeze({
  STUDENT: "student",
  PARENT: "parent",
  ADMIN: "admin",
  DEVELOPER: "developer",
});

/**
 * Checks if a role is valid (exists in ROLES).
 * @param {string} role
 * @returns {boolean}
 */
export const isValidRole = (role) => {
  if (!role) {
    console.log('isValidRole: role is falsy:', role);
    return false;
  }
  
  if (typeof role !== 'string') {
    console.log('isValidRole: role is not a string:', { role, type: typeof role });
    return false;
  }
  
  if (role.trim().length === 0) {
    console.log('isValidRole: role is empty or whitespace:', role);
    return false;
  }
  
  if (role.trim().length > 20) {
    console.log('isValidRole: role is too long:', role);
    return false;
  }
  
  if (role.trim().length < 3) {
    console.log('isValidRole: role is too short:', role);
    return false;
  }
  
  if (!/^[a-zA-Z]+$/.test(role.trim())) {
    console.log('isValidRole: role contains invalid characters:', role);
    return false;
  }
  
  const normalizedRole = role.toLowerCase();
  const isValid = Object.values(ROLES).includes(normalizedRole);
  
  console.log('isValidRole validation:', { 
    originalRole: role, 
    normalizedRole, 
    isValid, 
    validRoles: Object.values(ROLES) 
  });
  
  return isValid;
};

/**
 * Checks if a role matches a target role.
 * @param {string} role
 * @param {string} target
 * @returns {boolean}
 */
export const isRole = (role, target) => {
  if (!role || !target) {
    console.log('isRole: missing role or target:', { role, target });
    return false;
  }
  
  if (typeof role !== 'string' || typeof target !== 'string') {
    console.log('isRole: role or target is not a string:', { role, type: typeof role, target, type: typeof target });
    return false;
  }
  
  if (role.trim().length === 0 || target.trim().length === 0) {
    console.log('isRole: role or target is empty or whitespace:', { role, target });
    return false;
  }
  
  if (role.trim().length < 3 || target.trim().length < 3) {
    console.log('isRole: role or target is too short:', { role, target });
    return false;
  }
  
  if (!/^[a-zA-Z]+$/.test(role.trim()) || !/^[a-zA-Z]+$/.test(target.trim())) {
    console.log('isRole: role or target contains invalid characters:', { role, target });
    return false;
  }
  
  const result = role.toLowerCase() === target.toLowerCase();
  console.log('isRole comparison:', { role, target, result });
  return result;
};

/**
 * Get all roles as an array (values only, lowercase).
 * Preserves the definition order from ROLES.
 * @returns {string[]}
 */
export const getAllRoles = () => {
  const roles = Object.values(ROLES);
  console.log('getAllRoles returning:', roles);
  return roles;
};

/**
 * Get only roles visible to public users (no developer/internal roles).
 * @returns {string[]}
 */
export const getPublicRoles = () => {
  const publicRoles = [ROLES.STUDENT, ROLES.PARENT, ROLES.ADMIN, ROLES.DEVELOPER];
  console.log('getPublicRoles returning:', publicRoles);
  return publicRoles;
};

/**
 * Get the key (uppercase) for a given role value.
 * @param {string} role
 * @returns {string|null}
 */
export const getRoleKey = (role) => {
  if (!role || typeof role !== 'string') {
    console.log('getRoleKey: invalid role input:', { role, type: typeof role });
    return null;
  }
  
  if (role.trim().length === 0) {
    console.log('getRoleKey: role is empty or whitespace:', role);
    return null;
  }
  
  if (role.trim().length > 20) {
    console.log('getRoleKey: role is too long:', role);
    return null;
  }
  
  if (role.trim().length < 3) {
    console.log('getRoleKey: role is too short:', role);
    return null;
  }
  
  if (!/^[a-zA-Z]+$/.test(role.trim())) {
    console.log('getRoleKey: role contains invalid characters:', role);
    return null;
  }
  
  const found = Object.entries(ROLES).find(
    ([, value]) => value.toLowerCase() === role.toLowerCase()
  );
  
  const result = found ? found[0] : null;
  console.log('getRoleKey:', { input: role, output: result });
  return result;
};

/**
 * Format role for display (capitalize first letter).
 * @param {string} role
 * @returns {string}
 */
export const formatRoleLabel = (role) => {
  if (!role || typeof role !== "string") {
    console.log('formatRoleLabel: invalid role input:', { role, type: typeof role });
    return "";
  }
  
  if (role.trim().length === 0) {
    console.log('formatRoleLabel: role is empty or whitespace:', role);
    return "";
  }
  
  if (role.trim().length > 20) {
    console.log('formatRoleLabel: role is too long:', role);
    return "";
  }
  
  if (role.trim().length < 3) {
    console.log('formatRoleLabel: role is too short:', role);
    return "";
  }
  
  if (!/^[a-zA-Z]+$/.test(role.trim())) {
    console.log('formatRoleLabel: role contains invalid characters:', role);
    return "";
  }
  
  const result = role.charAt(0).toUpperCase() + role.slice(1);
  console.log('formatRoleLabel:', { input: role, output: result });
  return result;
};

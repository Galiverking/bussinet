// Input validators
import { toast } from './formatters.js';

export const VALIDATOR = {
  customerName(v) {
    if (!v || v.trim().length === 0) return 'กรุณากรอกชื่อลูกค้า';
    if (v.trim().length > 100) return 'ชื่อต้องไม่เกิน 100 ตัวอักษร';
    return null;
  },

  phone(v) {
    if (!v) return null;
    const cleaned = v.replace(/\D/g, '');
    if (cleaned.length > 0 && cleaned.length < 9) return 'เบอร์โทรไม่ถูกต้อง';
    if (cleaned.length > 12) return 'เบอร์โทรยาวเกินไป';
    return null;
  },

  price(v) {
    if (v === '' || v === null || v === undefined) return null;
    const num = parseInt(v);
    if (isNaN(num)) return 'ราคาต้องเป็นตัวเลข';
    if (num < 0) return 'ราคาต้องไม่ติดลบ';
    if (num > 1000000) return 'ราคาต้องไม่เกิน 1,000,000 บาท';
    return null;
  },

  quantity(v) {
    if (v === '' || v === null || v === undefined) return null;
    const num = parseInt(v);
    if (isNaN(num)) return 'จำนวนต้องเป็นตัวเลข';
    if (num < 0) return 'จำนวนต้องไม่ติดลบ';
    if (num > 1000) return 'จำนวนต้องไม่เกิน 1,000';
    return null;
  },

  tags(v) {
    if (!v) return null;
    if (v.length > 200) return 'แท็กยาวเกินไป';
    return null;
  },

  location(v) {
    if (!v) return null;
    if (v.length > 500) return 'ที่อยู่ยาวเกินไป';
    return null;
  },
};

export function validateJobForm() {
  const errors = [];

  const name = document.getElementById('fName').value;
  let err = VALIDATOR.customerName(name);
  if (err) errors.push(err);

  const phone = document.getElementById('fPhone').value;
  err = VALIDATOR.phone(phone);
  if (err) errors.push(err);

  const price = document.getElementById('fPrice').value;
  err = VALIDATOR.price(price);
  if (err) errors.push(err);

  const qty = document.getElementById('fQty').value;
  err = VALIDATOR.quantity(qty);
  if (err) errors.push(err);

  const loc = document.getElementById('fLocation').value;
  err = VALIDATOR.location(loc);
  if (err) errors.push(err);

  const tags = document.getElementById('fTags')?.value;
  err = VALIDATOR.tags(tags);
  if (err) errors.push(err);

  return errors;
}

export function validateExpenseForm() {
  const errors = [];

  const name = document.getElementById('eName').value;
  if (!name || name.trim().length === 0) errors.push('กรุณากรอกชื่อรายจ่าย');
  if (name && name.trim().length > 100)
    errors.push('ชื่อต้องไม่เกิน 100 ตัวอักษร');

  const amount = document.getElementById('eAmount').value;
  const err = VALIDATOR.price(amount);
  if (err) errors.push(err);

  return errors;
}

export function showValidationErrors(errors) {
  if (errors.length > 0) {
    return true;
  }
  return false;
}

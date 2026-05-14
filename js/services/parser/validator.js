// Parser Validator - Validate extracted data

export function validate(job) {
  const errors = [];

  if (!job.customer_name) {
    errors.push('ไม่พบชื่อลูกค้า');
  }

  if (job.phone && job.phone.length < 9) {
    errors.push('เบอร์โทรไม่ถูกต้อง');
  }

  if (job.price && job.price < 0) {
    errors.push('ราคาติดลบ');
  }

  if (job.quantity && job.quantity < 0) {
    errors.push('จำนวนติดลบ');
  }

  return {
    isValid: errors.length === 0,
    errors,
    job
  };
}

export function validateBatch(jobs) {
  return jobs.map(job => validate(job));
}
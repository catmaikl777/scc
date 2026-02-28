const fs = require('fs');

try {
  const content = fs.readFileSync('server.js', 'utf8');
  const lines = content.split('\n');
  
  let parenCount = 0;
  let braceCount = 0;
  let bracketCount = 0;
  let errors = [];
  
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i];
    
    // Skip comments and strings
    let inString = false;
    let inComment = false;
    let escapeNext = false;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const prevChar = j > 0 ? line[j - 1] : '';
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      
      if (char === '"' && !inComment) {
        inString = !inString;
        continue;
      }
      
      if (inString || inComment) continue;
      
      // Check for comments
      if (char === '/' && prevChar === '/') {
        inComment = true;
        continue;
      }
      
      // Count brackets
      if (char === '(') parenCount++;
      if (char === ')') parenCount--;
      if (char === '{') braceCount++;
      if (char === '}') braceCount--;
      if (char === '[') bracketCount++;
      if (char === ']') bracketCount--;
      
      // Check for negative counts
      if (parenCount < 0) {
        errors.push(`Line ${lineNum}: Extra closing parenthesis`);
        parenCount = 0;
      }
      if (braceCount < 0) {
        errors.push(`Line ${lineNum}: Extra closing brace`);
        braceCount = 0;
      }
      if (bracketCount < 0) {
        errors.push(`Line ${lineNum}: Extra closing bracket`);
        bracketCount = 0;
      }
    }
  }
  
  console.log('Bracket balance check:');
  console.log(`Parentheses: ${parenCount}`);
  console.log(`Braces: ${braceCount}`);
  console.log(`Brackets: ${bracketCount}`);
  
  if (errors.length > 0) {
    console.log('\nErrors found:');
    errors.forEach(err => console.log(err));
  } else {
    console.log('\nNo bracket balance errors found.');
  }
  
  if (parenCount !== 0) console.log(`Missing ${parenCount} closing parenthesis(s)`);
  if (braceCount !== 0) console.log(`Missing ${braceCount} closing brace(s)`);
  if (bracketCount !== 0) console.log(`Missing ${bracketCount} closing bracket(s)`);
  
} catch (error) {
  console.error('Error reading file:', error.message);
}
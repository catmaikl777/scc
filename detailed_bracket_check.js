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
    
    // Skip comments and strings more carefully
    let inString = false;
    let inComment = false;
    let escapeNext = false;
    let stringChar = null;
    
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const prevChar = j > 0 ? line[j - 1] : '';
      
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      
      // Handle escape sequences
      if (char === '\\' && (inString || inComment)) {
        escapeNext = true;
        continue;
      }
      
      // Handle string boundaries
      if ((char === '"' || char === "'") && !inComment) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = null;
        }
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
        errors.push(`Line ${lineNum}: Extra closing parenthesis - "${line.trim()}"`);
        parenCount = 0;
      }
      if (braceCount < 0) {
        errors.push(`Line ${lineNum}: Extra closing brace - "${line.trim()}"`);
        braceCount = 0;
      }
      if (bracketCount < 0) {
        errors.push(`Line ${lineNum}: Extra closing bracket - "${line.trim()}"`);
        bracketCount = 0;
      }
    }
  }
  
  console.log('=== BRACKET BALANCE ANALYSIS ===');
  console.log(`Final counts - Parentheses: ${parenCount}, Braces: ${braceCount}, Brackets: ${bracketCount}`);
  
  if (errors.length > 0) {
    console.log('\n=== ERRORS FOUND ===');
    errors.forEach(err => console.log(err));
  } else {
    console.log('\nNo bracket balance errors found in individual lines.');
  }
  
  if (parenCount !== 0) console.log(`\nMissing ${parenCount} closing parenthesis(s)`);
  if (braceCount !== 0) console.log(`Missing ${braceCount} closing brace(s)`);
  if (bracketCount !== 0) console.log(`Missing ${bracketCount} closing bracket(s)`);
  
  // Additional check: look for common patterns that might indicate problems
  console.log('\n=== ADDITIONAL ANALYSIS ===');
  
  // Check for function definitions without closing braces
  const functionPattern = /function\s+\w+\s*\([^)]*\)\s*\{/g;
  const arrowFunctionPattern = /\([^)]*\)\s*=>\s*\{/g;
  const ifPattern = /if\s*\([^)]*\)\s*\{/g;
  
  let match;
  let functionCount = 0;
  let arrowFunctionCount = 0;
  let ifCount = 0;
  
  while ((match = functionPattern.exec(content)) !== null) {
    functionCount++;
  }
  while ((match = arrowFunctionPattern.exec(content)) !== null) {
    arrowFunctionCount++;
  }
  while ((match = ifPattern.exec(content)) !== null) {
    ifCount++;
  }
  
  console.log(`Found ${functionCount} function definitions`);
  console.log(`Found ${arrowFunctionCount} arrow functions with braces`);
  console.log(`Found ${ifCount} if statements with braces`);
  
} catch (error) {
  console.error('Error reading file:', error.message);
}
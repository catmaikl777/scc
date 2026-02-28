const fs = require('fs');

try {
  const content = fs.readFileSync('server.js', 'utf8');
  const lines = content.split('\n');
  
  console.log('=== SEARCHING FOR SPECIFIC ISSUES ===');
  
  // Look for common patterns that might indicate problems
  let issues = [];
  
  // Check for function definitions that might not be closed
  const functionPattern = /function\s+\w+\s*\([^)]*\)\s*\{/g;
  let match;
  const functions = [];
  while ((match = functionPattern.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    functions.push({ line: lineNum, text: match[0] });
  }
  
  // Check for arrow functions with braces
  const arrowPattern = /\([^)]*\)\s*=>\s*\{/g;
  const arrowFunctions = [];
  while ((match = arrowPattern.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    arrowFunctions.push({ line: lineNum, text: match[0] });
  }
  
  // Check for if statements with braces
  const ifPattern = /if\s*\([^)]*\)\s*\{/g;
  const ifStatements = [];
  while ((match = ifPattern.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    ifStatements.push({ line: lineNum, text: match[0] });
  }
  
  // Check for try blocks
  const tryPattern = /try\s*\{/g;
  const tryBlocks = [];
  while ((match = tryPattern.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    tryBlocks.push({ line: lineNum, text: match[0] });
  }
  
  // Check for switch statements
  const switchPattern = /switch\s*\([^)]*\)\s*\{/g;
  const switchStatements = [];
  while ((match = switchPattern.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    switchStatements.push({ line: lineNum, text: match[0] });
  }
  
  console.log(`Found ${functions.length} function definitions`);
  console.log(`Found ${arrowFunctions.length} arrow functions with braces`);
  console.log(`Found ${ifStatements.length} if statements with braces`);
  console.log(`Found ${tryBlocks.length} try blocks`);
  console.log(`Found ${switchStatements.length} switch statements`);
  
  // Look for specific problematic patterns
  console.log('\n=== CHECKING FOR SPECIFIC PATTERNS ===');
  
  // Check for duplicate case statements (which we fixed earlier)
  const casePattern = /case\s+"[^"]+":/g;
  const cases = [];
  while ((match = casePattern.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    cases.push({ line: lineNum, text: match[0] });
  }
  
  console.log(`Found ${cases.length} case statements`);
  
  // Check for potentially problematic areas around line 2090
  console.log('\n=== CHECKING AREA AROUND LINE 2090 ===');
  for (let i = 2085; i <= 2095; i++) {
    if (i < lines.length) {
      console.log(`${i}: ${lines[i].trim()}`);
    }
  }
  
  // Check for unclosed blocks by looking at indentation patterns
  console.log('\n=== CHECKING INDENTATION PATTERNS ===');
  let braceStack = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('//')) continue;
    
    // Count braces on this line
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    
    if (openBraces > 0 || closeBraces > 0) {
      console.log(`Line ${lineNum}: +${openBraces} -{${closeBraces} braces - ${line.trim()}`);
      
      // Track brace balance
      for (let j = 0; j < openBraces; j++) {
        braceStack.push({ line: lineNum, type: 'open' });
      }
      for (let j = 0; j < closeBraces; j++) {
        if (braceStack.length > 0) {
          braceStack.pop();
        } else {
          console.log(`  WARNING: Extra closing brace at line ${lineNum}`);
        }
      }
    }
  }
  
  if (braceStack.length > 0) {
    console.log('\n=== UNCLOSED BLOCKS ===');
    braceStack.forEach(item => {
      console.log(`Unclosed block started at line ${item.line}`);
    });
  } else {
    console.log('\nNo unclosed blocks found based on brace counting.');
  }
  
} catch (error) {
  console.error('Error:', error.message);
}
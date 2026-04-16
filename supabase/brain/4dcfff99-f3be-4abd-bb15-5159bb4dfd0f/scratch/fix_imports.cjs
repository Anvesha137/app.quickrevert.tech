const fs = require('fs');
const path = require('path');

const uiDir = path.join(process.cwd(), 'src/components/ui');

fs.readdirSync(uiDir).forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    const filePath = path.join(uiDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Regex to remove @version from package imports
    // Matches @ followed by digits and dots, but only inside quotes
    const newContent = content.replace(/(@radix-ui\/react-[a-z-]+|lucide-react|class-variance-authority|input-otp|recharts|sonner|vaul|cmdk|next-themes|react-day-picker|react-resizable-panels)@[v0-9\.]+/g, '$1');
    
    if (content !== newContent) {
      console.log(`Fixing ${file}`);
      fs.writeFileSync(filePath, newContent, 'utf8');
    }
  }
});

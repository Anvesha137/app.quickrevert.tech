const fs = require('fs');
const path = require('path');

const functionsDir = 'c:/QuickRevert/app.quickrevert.tech/supabase/functions';
const subDirs = fs.readdirSync(functionsDir).filter(f => fs.statSync(path.join(functionsDir, f)).isDirectory());

for (const dirName of subDirs) {
    if (dirName === '_shared') continue;
    
    const indexFile = path.join(functionsDir, dirName, 'index.ts');
    if (fs.existsSync(indexFile)) {
        let content = fs.readFileSync(indexFile, 'utf8');
        
        if (content.includes('logInvocation')) {
            console.log(`Skipping ${dirName}, already instrumented.`);
            continue;
        }
        
        // 1. Add Import
        const importLine = 'import { logInvocation } from "../_shared/logger.ts";\n';
        content = importLine + content;
        
        // 2. Inject call
        const patterns = [
            /Deno\.serve\(async\s*\(req[:\w\s]*\)\s*=>\s*\{/,
            /serve\(async\s*\(req[:\w\s]*\)\s*=>\s*\{/
        ];
        
        let matched = false;
        for (const pattern of patterns) {
            if (pattern.test(content)) {
                content = content.replace(pattern, (match) => {
                    return `${match}\n  await logInvocation(req, "${dirName}");`;
                });
                matched = true;
                break;
            }
        }
        
        if (matched) {
            fs.writeFileSync(indexFile, content);
            console.log(`Instrumented ${dirName}`);
        } else {
            console.log(`Could not find serve block in ${dirName}, skipping.`);
        }
    }
}

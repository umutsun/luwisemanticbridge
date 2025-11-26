const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const componentsDir = path.join(srcDir, 'components');
const templatesDir = path.join(srcDir, 'templates');
const appDir = path.join(srcDir, 'app');

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            arrayOfFiles.push(path.join(dirPath, "/", file));
        }
    });

    return arrayOfFiles;
}

const allSrcFiles = getAllFiles(srcDir);
const componentFiles = [
    ...getAllFiles(componentsDir),
    ...getAllFiles(templatesDir)
].filter(f => f.endsWith('.tsx'));

const pageFiles = getAllFiles(appDir).filter(f => f.endsWith('page.tsx'));

console.log('Analyzing usage...');

const orphanComponents = [];
const orphanPages = [];

// Check Components
componentFiles.forEach(compFile => {
    const compName = path.basename(compFile, '.tsx');
    // Simple check: look for the component name in all files
    // This is a heuristic and might have false positives/negatives (e.g. dynamic imports, renamed imports)
    let isUsed = false;
    for (const file of allSrcFiles) {
        if (file === compFile) continue;
        const content = fs.readFileSync(file, 'utf8');
        if (content.includes(compName)) {
            isUsed = true;
            break;
        }
    }
    if (!isUsed) {
        orphanComponents.push(compFile);
    }
});

// Check Pages (basic link check)
pageFiles.forEach(pageFile => {
    // Convert file path to route
    // e.g. src/app/dashboard/page.tsx -> /dashboard
    let route = pageFile.replace(appDir, '').replace(/\\/g, '/').replace('/page.tsx', '');
    if (route === '') route = '/';

    let isLinked = false;
    // Check for string usage of the route
    for (const file of allSrcFiles) {
        if (file === pageFile) continue;
        const content = fs.readFileSync(file, 'utf8');
        // Check for href="/route" or router.push('/route') or just the string '/route'
        if (content.includes(`"${route}"`) || content.includes(`'${route}'`) || content.includes(`\`${route}\``)) {
            isLinked = true;
            break;
        }
    }
    // Root page is always "linked" effectively
    if (route === '/') isLinked = true;

    if (!isLinked) {
        orphanPages.push({ file: pageFile, route });
    }
});

console.log('--- Orphan Components ---');
orphanComponents.forEach(c => console.log(c));
console.log('\n--- Potentially Orphan Pages ---');
orphanPages.forEach(p => console.log(`${p.route} (${p.file})`));

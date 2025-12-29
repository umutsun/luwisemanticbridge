const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = function runUnitTests() {
    return new Promise((resolve) => {
        console.log('\n🧪 Running Backend Unit Tests (Jest)...');
        const backendDir = path.join(__dirname, '../backend');
        const updatedPath = path.join(backendDir, 'jest-results.json');

        // Remove previous results
        if (fs.existsSync(updatedPath)) {
            try { fs.unlinkSync(updatedPath); } catch (e) { }
        }

        // Run jest and output to json
        // We allow it to fail (exit code 1) because we want to parse the results
        exec('npx jest --json --outputFile=jest-results.json', { cwd: backendDir, maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
            try {
                if (fs.existsSync(updatedPath)) {
                    const fileContent = fs.readFileSync(updatedPath, 'utf8');
                    const results = JSON.parse(fileContent);

                    console.log(`    Detailed results saved to backend/jest-results.json`);
                    console.log(`    Stats: ${results.numPassedTests} passed, ${results.numFailedTests} failed, ${results.numTotalTests} total`);

                    resolve({
                        summary: {
                            total: results.numTotalTests,
                            passed: results.numPassedTests,
                            failed: results.numFailedTests
                        }
                    });
                } else {
                    throw new Error('Results file not found');
                }
            } catch (e) {
                console.log('    ❌ Could not parse Jest results or execution failed completely');
                console.log('    ' + e.message);
                if (stderr) console.log('    Stderr: ' + stderr.substring(0, 200) + '...');

                resolve({ summary: { total: 0, passed: 0, failed: 1 } });
            }
        });
    });
};

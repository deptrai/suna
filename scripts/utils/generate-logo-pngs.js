const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Kiểm tra xem có ImageMagick không
function checkImageMagick() {
    try {
        execSync('convert -version', { stdio: 'ignore' });
        return true;
    } catch (error) {
        return false;
    }
}

// Tạo PNG từ SVG sử dụng ImageMagick
function convertSvgToPng(svgPath, pngPath, size) {
    try {
        const command = `convert -background transparent -size ${size}x${size} "${svgPath}" "${pngPath}"`;
        execSync(command, { stdio: 'inherit' });
        console.log(`✅ Created: ${pngPath}`);
    } catch (error) {
        console.error(`❌ Failed to create ${pngPath}:`, error.message);
    }
}

// Tạo PNG từ SVG sử dụng rsvg-convert (alternative)
function convertSvgToPngRsvg(svgPath, pngPath, size) {
    try {
        const command = `rsvg-convert -w ${size} -h ${size} -b transparent "${svgPath}" -o "${pngPath}"`;
        execSync(command, { stdio: 'inherit' });
        console.log(`✅ Created: ${pngPath}`);
    } catch (error) {
        console.error(`❌ Failed to create ${pngPath}:`, error.message);
    }
}

// Main function
function generateLogoPngs() {
    const svgDir = 'assets/logos/svg';
    const pngDir = 'assets/logos/png';
    const sizes = [64, 128, 256];
    
    const svgFiles = [
        'chainlens-full.svg',
        'chainlens-icon.svg',
        'chainlens-text.svg',
        'chainlens-vertical.svg',
        'chainlens-horizontal.svg'
    ];

    console.log('🎨 Generating PNG versions of ChainLens logos...\n');

    // Kiểm tra tools
    const hasImageMagick = checkImageMagick();
    let hasRsvg = false;
    try {
        execSync('rsvg-convert --version', { stdio: 'ignore' });
        hasRsvg = true;
    } catch (error) {
        hasRsvg = false;
    }

    if (!hasImageMagick && !hasRsvg) {
        console.error('❌ Neither ImageMagick nor rsvg-convert found. Please install one of them:');
        console.error('   brew install imagemagick');
        console.error('   brew install librsvg');
        process.exit(1);
    }

    const converter = hasImageMagick ? convertSvgToPng : convertSvgToPngRsvg;
    const toolName = hasImageMagick ? 'ImageMagick' : 'rsvg-convert';
    console.log(`📦 Using ${toolName} for conversion\n`);

    sizes.forEach(size => {
        console.log(`📏 Generating ${size}px versions:`);
        
        svgFiles.forEach(svgFile => {
            const svgPath = path.join(svgDir, svgFile);
            const pngFile = svgFile.replace('.svg', '.png');
            const pngPath = path.join(pngDir, `${size}px`, pngFile);
            
            if (fs.existsSync(svgPath)) {
                converter(svgPath, pngPath, size);
            } else {
                console.error(`❌ SVG file not found: ${svgPath}`);
            }
        });
        
        console.log('');
    });

    console.log('🎉 Logo PNG generation completed!');
}

// Run the script
generateLogoPngs();

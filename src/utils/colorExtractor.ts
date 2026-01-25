// Extract the most dominant non-white color from an image URL
export async function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve('hsl(var(--primary))');
          return;
        }
        
        // Use a smaller sample size for performance
        const sampleSize = 100;
        canvas.width = sampleSize;
        canvas.height = sampleSize;
        ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
        
        const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
        const colorCounts: { [key: string]: { count: number; r: number; g: number; b: number; saturation: number } } = {};
        
        // Sample every 4th pixel for performance
        for (let i = 0; i < imageData.length; i += 16) {
          const r = imageData[i];
          const g = imageData[i + 1];
          const b = imageData[i + 2];
          const a = imageData[i + 3];
          
          // Skip transparent pixels
          if (a < 128) continue;
          
          // Skip white/near-white colors (all channels > 230)
          if (r > 230 && g > 230 && b > 230) continue;
          
          // Skip very light grey (r,g,b close together and all > 200)
          const maxC = Math.max(r, g, b);
          const minC = Math.min(r, g, b);
          const lightness = (maxC + minC) / 2;
          const chroma = maxC - minC;
          
          // Skip if too light or too grey
          if (lightness > 220 && chroma < 30) continue;
          
          // Skip very dark colors
          if (r < 15 && g < 15 && b < 15) continue;
          
          // Calculate saturation (HSL saturation)
          let saturation = 0;
          if (maxC !== minC) {
            if (lightness <= 127) {
              saturation = (maxC - minC) / (maxC + minC);
            } else {
              saturation = (maxC - minC) / (510 - maxC - minC);
            }
          }
          
          // Group similar colors together (quantize to reduce color space)
          const keyR = Math.floor(r / 15) * 15;
          const keyG = Math.floor(g / 15) * 15;
          const keyB = Math.floor(b / 15) * 15;
          const key = `${keyR},${keyG},${keyB}`;
          
          if (!colorCounts[key]) {
            colorCounts[key] = { count: 0, r: keyR, g: keyG, b: keyB, saturation };
          }
          colorCounts[key].count++;
          // Keep the highest saturation for this color group
          if (saturation > colorCounts[key].saturation) {
            colorCounts[key].saturation = saturation;
          }
        }
        
        // Sort colors by count * saturation to favor vibrant common colors
        const sortedColors = Object.values(colorCounts)
          .sort((a, b) => (b.count * (b.saturation + 0.1)) - (a.count * (a.saturation + 0.1)));
        
        if (sortedColors.length > 0) {
          const best = sortedColors[0];
          resolve(`rgb(${best.r}, ${best.g}, ${best.b})`);
        } else {
          resolve('hsl(var(--primary))');
        }
      } catch {
        resolve('hsl(var(--primary))');
      }
    };
    
    img.onerror = () => resolve('hsl(var(--primary))');
    img.src = imageUrl;
  });
}

// Extract gradient colors from an image URL (legacy function)
export async function extractColors(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('linear-gradient(135deg, rgba(62, 139, 104, 0.4) 0%, rgba(42, 95, 74, 0.6) 100%)');
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const colorCounts: { [key: string]: number } = {};

      // Sample colors
      for (let i = 0; i < imageData.length; i += 4 * 10) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        const a = imageData[i + 3];

        if (a < 125) continue;
        if (r > 250 && g > 250 && b > 250) continue;
        if (r < 10 && g < 10 && b < 10) continue;

        const key = `${Math.floor(r / 10)},${Math.floor(g / 10)},${Math.floor(b / 10)}`;
        colorCounts[key] = (colorCounts[key] || 0) + 1;
      }

      const sortedColors = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (sortedColors.length > 0) {
        const [r, g, b] = sortedColors[0][0].split(',').map(n => parseInt(n) * 10);
        const [r2, g2, b2] = sortedColors[1]?.[0].split(',').map(n => parseInt(n) * 10) || [r, g, b];

        const gradient = `linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.7) 0%, rgba(${r2}, ${g2}, ${b2}, 0.9) 100%)`;
        resolve(gradient);
      } else {
        resolve('linear-gradient(135deg, rgba(62, 139, 104, 0.4) 0%, rgba(42, 95, 74, 0.6) 100%)');
      }
    };

    img.onerror = () => {
      resolve('linear-gradient(135deg, rgba(62, 139, 104, 0.4) 0%, rgba(42, 95, 74, 0.6) 100%)');
    };

    img.src = imageUrl;
  });
}

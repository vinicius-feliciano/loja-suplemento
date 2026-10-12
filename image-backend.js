/**
 * Nova Era Nutrition — ImageBackend & Loja Config
 * ══════════════════════════════════════════════
 * Normalizador e gerenciador de links de imagem (Drive, Dropbox, Imgur)
 * e configurações globais de exibição da vitrine.
 */

const LOJA_CONFIG = {
  whatsappNumero:    '5516993998499',
  freteGratisMinimo: 199,
  nomeNegocio:       'Nova Era Nutrition',
};

const ImageBackend = {
  extractGoogleDriveId(url) {
    if (!url || typeof url !== 'string') return null;
    const clean = url.trim();
    if (clean.includes('/drive/folders/')) return null;

    const patterns = [
      /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i,
      /drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i,
      /docs\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i,
      /drive\.google\.com\/thumbnail\?(?:.*&)?id=([a-zA-Z0-9_-]+)/i,
      /lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/i,
    ];

    for (const pattern of patterns) {
      const match = clean.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  },

  isGoogleDriveFolder(url) {
    return typeof url === 'string' && url.includes('/drive/folders/');
  },

  detectProvider(url) {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('/uploads/') || url.startsWith('uploads/')) return 'Foto Local (Upload)';
    if (url.startsWith('data:image/')) return 'Foto Real (Arquivo)';
    if (this.extractGoogleDriveId(url)) return 'Google Drive';
    if (this.isGoogleDriveFolder(url)) return 'Pasta Drive (Inválido)';
    if (/dropbox\.com/i.test(url)) return 'Dropbox';
    if (/imgur\.com/i.test(url)) return 'Imgur';
    if (/imgbb\.com|ibb\.co/i.test(url)) return 'ImgBB';
    if (/postimg\.cc/i.test(url)) return 'Postimages';
    if (/onedrive\.live\.com|1drv\.ms/i.test(url)) return 'OneDrive';
    if (/^https?:\/\//i.test(url)) return 'Web';
    return null;
  },

  normalizeUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    let url = rawUrl.trim();
    url = url.replace(/^["'<(\[]+|[>"')\]]+$/g, '').trim();
    if (!url) return '';

    const driveId = this.extractGoogleDriveId(url);
    if (driveId) {
      return `https://lh3.googleusercontent.com/d/${driveId}`;
    }

    if (/dropbox\.com/i.test(url)) {
      try {
        const u = new URL(url);
        u.searchParams.delete('dl');
        u.searchParams.set('raw', '1');
        return u.toString().replace('www.dropbox.com', 'dl.dropboxusercontent.com');
      } catch (_) {
        return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/[?&]dl=0/, '?raw=1');
      }
    }

    const imgurMatch = url.match(/^https?:\/\/(?:i\.)?imgur\.com\/([a-zA-Z0-9]+)(?:\.[a-zA-Z]+)?$/i);
    if (imgurMatch && !url.includes('/a/') && !url.includes('/gallery/')) {
      const imgId = imgurMatch[1];
      return `https://i.imgur.com/${imgId}.jpg`;
    }

    return url;
  },

  getFallbackUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const driveId = this.extractGoogleDriveId(url);
    if (driveId) {
      if (url.includes('lh3.googleusercontent.com')) {
        return `https://drive.google.com/thumbnail?id=${driveId}&sz=w1200`;
      }
      return `https://lh3.googleusercontent.com/d/${driveId}`;
    }
    return '';
  },

  parseMultipleUrls(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input
        .flatMap(item => this.parseMultipleUrls(item))
        .filter(Boolean);
    }
    if (typeof input !== 'string') return [];

    let parts = input.split(/[\r\n,;]+/);
    if (parts.length === 1 && input.includes('http')) {
      parts = input.split(/\s+(?=https?:\/\/)/i);
    }

    const results = [];
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const matches = trimmed.match(/https?:\/\/[^\s"',;]+/gi);
      if (matches && matches.length > 0) {
        for (const m of matches) {
          const norm = this.normalizeUrl(m);
          if (norm && !results.includes(norm)) {
            results.push(norm);
          }
        }
      } else {
        const norm = this.normalizeUrl(trimmed);
        if (norm && !results.includes(norm)) {
          results.push(norm);
        }
      }
    }
    return results;
  },

  normalizeProduct(p) {
    if (!p || typeof p !== 'object') return p;

    let list = [];
    if (Array.isArray(p.imagens) && p.imagens.length > 0) {
      list = [...p.imagens];
    } else if (typeof p.imagens === 'string' && p.imagens.trim()) {
      list = this.parseMultipleUrls(p.imagens);
    }

    // Se imagens estiver vazio mas tiver imagem principal, usa ela
    if (list.length === 0 && p.imagem && typeof p.imagem === 'string') {
      list = this.parseMultipleUrls(p.imagem);
    }

    const normalizedImagens = [];
    for (const item of list) {
      if (!item || typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const norm = this.normalizeUrl(trimmed);
      if (norm) {
        normalizedImagens.push(norm);
      }
    }

    // Suporte para até 8 fotos individuais
    const limitedImagens = normalizedImagens.slice(0, 8);
    const mainImg = limitedImagens[0] || (typeof p.imagem === 'string' ? this.normalizeUrl(p.imagem) : '');

    return {
      ...p,
      imagem:  mainImg,
      imagens: limitedImagens.length > 0 ? limitedImagens : (mainImg ? [mainImg] : []),
    };
  },

  getPlaceholderSvg(text = 'Sem imagem', w = 400, h = 300) {
    return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect fill='%231a1a1a' width='100%' height='100%'/><text x='50%' y='50%' fill='%23666' font-family='sans-serif' font-size='14' text-anchor='middle' dy='.3em'>${encodeURIComponent(text)}</text></svg>`;
  },

  handleImgError(imgEl, originalUrl) {
    if (!imgEl) return;
    const src = originalUrl || imgEl.getAttribute('data-original-src') || imgEl.src;
    const fallback = this.getFallbackUrl(src);

    if (fallback && imgEl.dataset.hasTriedFallback !== 'true') {
      imgEl.dataset.hasTriedFallback = 'true';
      imgEl.src = fallback;
      return;
    }

    imgEl.src = this.getPlaceholderSvg();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ImageBackend;
}


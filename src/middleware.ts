import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Ajouter exceptions
  if (
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // 2. Lire le cookie JWT
  // Le nom du cookie selon src/lib/auth.ts est 'bizanet_session'
  const token = request.cookies.get('bizanet_session')?.value;
  let isValid = false;
  let mustChangePassword = false;

  if (token) {
    try {
      // Décodage du payload JWT (sans vérification de signature car Middleware/Edge)
      const parts = token.split('.');
      if (parts.length === 3) {
        // Base64Url vers Base64
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        // Décodage
        const payloadStr = atob(base64);
        const payload = JSON.parse(payloadStr);
        
        // Vérifier si le token n'est pas expiré
        if (payload.exp && payload.exp * 1000 > Date.now()) {
          isValid = true;
          if (payload.mustChangePassword) {
            mustChangePassword = true;
          }
        }
      }
    } catch (e) {
      // Token malformé ou erreur de parsing
      isValid = false;
    }
  }

  // 3. Protéger toutes les routes /dashboard/*
  if (pathname.startsWith('/dashboard')) {
    console.log(`[Middleware] pathname: ${pathname}, hasCookie: ${!!token}, isValid: ${isValid}, redirectTarget: ${!isValid ? '/login' : 'next'}`);
    if (!isValid) {
      // Si invalide ou absent → redirect /login
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // Si valide → laisser passer
    return NextResponse.next();
  }

  // 4. Bonus : Si utilisateur connecté et va sur /login → redirect /dashboard
  if (pathname === '/login') {
    console.log(`[Middleware] pathname: ${pathname}, hasCookie: ${!!token}, isValid: ${isValid}, redirectTarget: ${isValid ? '/dashboard' : 'next'}`);
    if (isValid) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // 5. Protéger /change-password
  if (pathname === '/change-password') {
    if (!isValid) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  // 6. Protéger /portal/dashboard (End Customer)
  if (pathname.startsWith('/portal/dashboard')) {
    const customerToken = request.cookies.get('customer_session')?.value;
    if (!customerToken) {
      return NextResponse.redirect(new URL('/portal/login', request.url));
    }
    // Simplification: le composant Server validera le JWT.
    // S'il n'est pas valide, le composant redirigera vers /portal/login.
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Matcher global qui exclut les chemins statiques et les API d'auth.
     * Cela correspond aux exceptions demandées.
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};

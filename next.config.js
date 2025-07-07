/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  images: {
    remotePatterns: [
      { hostname: 'nft-cdn.alchemy.com' },
      { hostname: 'res.cloudinary.com' },
      { hostname: '*.ipfs.w3s.link' },
      { hostname: 'alchemy.mypinata.cloud' },
      { hostname: 'bafybeigczg5mnwyuj7jepylramy2pk4mar52i2vesklmdt53nuyopypqiu.ipfs.w3s.link' },
      { hostname: 'bafybeiexd3xvzkkft2lc2c2xwoem4qbwus55ge35f7or642deksfdzvgm4.ipfs.w3s.link' },
      { hostname: 'ipfs.io' },
      { hostname: '*.ipfs.dweb.link' },
      { hostname: 'gateway.pinata.cloud' }
    ],
  },
}

module.exports = nextConfig 
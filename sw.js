// 设置缓存版本号
const CACHE_NAME = 'lidianchi-cache-v1';

// 需要缓存的资源列表
const CACHE_URLS = [
  '/',
  '/index.html',
  'https://unpkg.com/three@0.128.0/build/three.min.js',
  'https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
];

// Service Worker 安装事件
self.addEventListener('install', event => {
  console.log('Service Worker 正在安装');
  
  // 跳过等待，直接激活
  self.skipWaiting();
  
  // 缓存核心资源
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('缓存已打开');
        return cache.addAll(CACHE_URLS);
      })
      .catch(err => {
        console.error('预缓存失败:', err);
      })
  );
});

// Service Worker 激活事件
self.addEventListener('activate', event => {
  console.log('Service Worker 已激活');
  
  // 清理旧版本缓存
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log('删除旧缓存:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  
  // 立即接管所有客户端
  return self.clients.claim();
});

// 处理请求事件
self.addEventListener('fetch', event => {
  // 只处理GET请求
  if (event.request.method !== 'GET') return;
  
  // CDN资源优先使用缓存
  const isCDNRequest = event.request.url.includes('unpkg.com') || 
                      event.request.url.includes('jsdelivr.net');
  
  if (isCDNRequest) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          // 如果缓存中有响应，则直接返回缓存
          if (cachedResponse) {
            console.log('从缓存返回:', event.request.url);
            return cachedResponse;
          }
          
          // 否则发起网络请求
          return fetch(event.request)
            .then(response => {
              // 检查响应是否有效
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              
              // 克隆响应，因为响应是流，只能使用一次
              const responseToCache = response.clone();
              
              // 将响应存入缓存
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                  console.log('CDN资源已缓存:', event.request.url);
                });
              
              return response;
            })
            .catch(err => {
              console.error('获取CDN资源失败:', err);
              // 如果是CDN资源获取失败，尝试使用备用CDN
              if (event.request.url.includes('unpkg.com')) {
                const backupUrl = event.request.url.replace('unpkg.com', 'cdn.jsdelivr.net/npm');
                console.log('尝试备用CDN:', backupUrl);
                return fetch(backupUrl)
                  .then(backupResponse => {
                    if (!backupResponse || backupResponse.status !== 200) {
                      return backupResponse;
                    }
                    
                    // 缓存备用资源
                    const backupResponseToCache = backupResponse.clone();
                    caches.open(CACHE_NAME)
                      .then(cache => {
                        cache.put(event.request, backupResponseToCache);
                        console.log('备用CDN资源已缓存');
                      });
                    
                    return backupResponse;
                  });
              }
              
              // 如果无法获取并且没有备用CDN，则返回带有错误信息的响应
              return new Response('网络错误，无法加载资源', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({
                  'Content-Type': 'text/plain'
                })
              });
            });
        })
    );
  } else {
    // 对于非CDN资源，使用网络优先策略
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 检查响应是否有效
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          // 克隆响应
          const responseToCache = response.clone();
          
          // 将响应存入缓存
          caches.open(CACHE_NAME)
            .then(cache => {
              cache.put(event.request, responseToCache);
            });
          
          return response;
        })
        .catch(err => {
          console.error('网络请求失败，尝试从缓存获取:', err);
          // 如果网络请求失败，尝试从缓存获取
          return caches.match(event.request)
            .then(cachedResponse => {
              if (cachedResponse) {
                console.log('从缓存返回:', event.request.url);
                return cachedResponse;
              }
              
              // 如果缓存中也没有，则返回带有错误信息的响应
              return caches.match('/')
                .then(homepageResponse => {
                  if (homepageResponse) {
                    return homepageResponse;
                  }
                  
                  return new Response('离线状态，无法加载资源', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: new Headers({
                      'Content-Type': 'text/plain'
                    })
                  });
                });
            });
        })
    );
  }
}); 
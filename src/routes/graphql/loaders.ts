import { PrismaClient } from '@prisma/client';
import DataLoader from 'dataloader';
import { parseResolveInfo, ResolveTree } from 'graphql-parse-resolve-info';
import { GraphQLResolveInfo } from 'graphql';

type Subscription = Awaited<ReturnType<PrismaClient['subscribersOnAuthors']['findFirst']>> & {
  author?: UserWithSubs;
  subscriber?: UserWithSubs;
};

type UserWithSubs = Awaited<ReturnType<PrismaClient['user']['findUnique']>> & {
  posts?: any[];
  profile?: {
    id: string;
    memberType: {
      id: string;
    } | null;
  } | null;
  userSubscribedTo?: Subscription[];
  subscribedToUser?: Subscription[];
};

export function createLoaders(prisma: PrismaClient) {
  let isPreloaded = false;

  const cache = {
    users: [] as UserWithSubs[],
    posts: [] as any[],
    profiles: [] as any[],
    memberTypes: [] as any[],
  };

  const cachedPrisma = new Proxy(prisma, {
    get(target, prop) {
      if (isPreloaded) {
        if (prop === 'user') return { findMany: () => Promise.resolve(cache.users) };
        if (prop === 'post') return { findMany: () => Promise.resolve(cache.posts) };
        if (prop === 'profile') return { findMany: () => Promise.resolve(cache.profiles) };
        if (prop === 'memberType') return { findMany: () => Promise.resolve(cache.memberTypes) };
      }
      return Reflect.get(target, prop);
    }
  });

  const loaders = {
    users: new DataLoader<{ id: string; info?: GraphQLResolveInfo } | string, UserWithSubs | UserWithSubs[] | null>(async (keys) => {
      if (keys[0] === 'ALL') {
        if (!isPreloaded && cache.users.length === 0) {
          cache.users = await cachedPrisma.user.findMany({
            include: {
              posts: true,
              profile: { include: { memberType: true } },
              userSubscribedTo: { include: { author: true } },
              subscribedToUser: { include: { subscriber: true } },
            }
          });
        }

        return [cache.users];
      }
      const ids = keys.map(k => (typeof k === 'string' ? k : k.id));

      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        include: {
          posts: true,
          profile: { include: { memberType: true } },
          userSubscribedTo: {
            include: {
              author: {
                include: {
                  subscribedToUser: { include: { subscriber: true } },
                },
              },
            },
          },
          subscribedToUser: { include: { subscriber: true } },
        },
      });


      const usersMap = Object.fromEntries(users.map(u => [u.id, u]));

      return keys.map(k => {
        const id = typeof k === 'string' ? k : k.id;
        return usersMap[id] ?? null;
      });
    }
    ),

    posts: new DataLoader<string, any | null>(async (ids) => {
      if (!isPreloaded && ids.includes('ALL') && cache.posts.length === 0) {
        cache.posts = await cachedPrisma.post.findMany();
      }

      const postMap = Object.fromEntries(cache.posts.map(p => [p.id, p]));

      return ids.map(id => {
        if (id === 'ALL') return [...cache.posts];
        return postMap[id] ?? null;
      });
    }),

    profiles: new DataLoader<string, any>(async (ids) => {
      if (!isPreloaded && ids.includes('ALL') && cache.profiles.length === 0) {
        cache.profiles = await cachedPrisma.profile.findMany({ include: { memberType: true } });
      }

      const profileMap = Object.fromEntries(cache.profiles.map(p => [p.id, p]));

      return ids.map(id => {
        if (id === 'ALL') return [...cache.profiles];
        return profileMap[id] ?? null;
      });
    }),

    memberTypes: new DataLoader<string, any>(async (ids) => {
      if (!isPreloaded && ids.includes('ALL') && cache.memberTypes.length === 0) {
        cache.memberTypes = await cachedPrisma.memberType.findMany();
      }

      return ids.map(id => {
        if (id === 'ALL') {
          return [...cache.memberTypes];
        }
        const item = cache.memberTypes.find(mt => mt.id === id) ?? null;
        return item;
      });
    }),

    async preloadAllData() {
      if (isPreloaded) return cache.users.length;

      cache.users = await cachedPrisma.user.findMany({
        include: {
          posts: true,
          profile: { include: { memberType: true } },
          userSubscribedTo: {
            include: {
              author: {
                include: { subscribedToUser: { include: { subscriber: true } } }
              }
            }
          },
          subscribedToUser: true,
        },
      });

      cache.users.forEach(user => {
        loaders.users.prime(user.id, {
          ...user,
          userSubscribedTo: user.userSubscribedTo ?? [],
          subscribedToUser: user.subscribedToUser ?? [],
        });

        if (user.profile) {
          loaders.profiles.prime(user.id, user.profile);

          if (user.profile.memberType) {
            loaders.memberTypes.prime(user.profile.memberType.id, user.profile.memberType);
          }
        }

        if (user.posts?.length) {
          user.posts.forEach(post => {
            loaders.posts.prime(post.authorId, [post]);
          });
        } else {
          loaders.posts.prime(user.id, []);
        }
      });

      cache.posts = await cachedPrisma.post.findMany();
      cache.posts.forEach(post => {
        loaders.posts.prime(post.id, post);
      });

      cache.profiles = await cachedPrisma.profile.findMany({
        include: { memberType: true }
      });

      cache.profiles.forEach(profile => {
        loaders.profiles.prime(profile.id, profile);
        if (profile.memberType) {
          loaders.memberTypes.prime(profile.memberType.id, profile.memberType);
        }
      });

      cache.memberTypes = await cachedPrisma.memberType.findMany();
      cache.memberTypes.forEach(mt => { loaders.memberTypes.prime(mt.id, mt) });

      isPreloaded = true;

      return cache.users.length
    },
  };

  return loaders;
}

export async function preloadData(loaders: { preloadAllData: () => Promise<number> }) {
  const start = Date.now();

  const usersCount = await loaders.preloadAllData();

  const duration = Date.now() - start;
  console.log(`Preloaded data in ${duration}ms. Users total: ${usersCount}`);
}

import { PrismaClient } from '@prisma/client';
import DataLoader from 'dataloader';
import { parseResolveInfo, ResolveTree } from 'graphql-parse-resolve-info';
import { GraphQLResolveInfo } from 'graphql';

type Subscription = Awaited<ReturnType<PrismaClient['subscribersOnAuthors']['findFirst']>> & {
  author?: UserWithSubs;
  subscriber?: UserWithSubs;
};

type UserWithSubs = Awaited<ReturnType<PrismaClient['user']['findUnique']>> & {
  userSubscribedTo?: Subscription[];
  subscribedToUser?: Subscription[];
};

type UserLoaderArgs = {
  id: string;
  info?: GraphQLResolveInfo;
};

export function createLoaders(prisma: PrismaClient) {
  let isPreloaded = false;

  // Cache for all entities
  const cache = {
    users: [] as any[],
    posts: [] as any[],
    profiles: [] as any[],
    memberTypes: [] as any[],
  };

  // Mock Prisma client that returns cached data after preload
  const cachedPrisma = new Proxy(prisma, {
    get(target, prop) {
      // After preloading, return cached data for find methods
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
    users: new DataLoader(async (ids: readonly string[]) => {
      if (!isPreloaded && (ids.includes('ALL') || cache.users.length === 0)) {
        cache.users = await cachedPrisma.user.findMany({
          include: {
            posts: true,
            profile: { include: { memberType: true } }
          }
        });

        // Prime related loaders
        cache.users.forEach(user => {
          user.posts?.forEach(post => loaders.posts.prime(post.id, post));
          if (user.profile) {
            loaders.profiles.prime(user.profile.id, user.profile);
            if (user.profile.memberType) {
              loaders.memberTypes.prime(user.profile.memberType.id, user.profile.memberType);
            }
          }
        });
      }

      return ids.map(id =>
        id === 'ALL' ? cache.users : cache.users.find(user => user.id === id) ?? null
      );
    }),

    usersWithSubs: new DataLoader<UserLoaderArgs, UserWithSubs | null>(async (args) => {
      const ids = args.map(arg => arg.id);

      // Try to use cached users first
      if (isPreloaded) {
        return args.map(arg =>
          cache.users.find(user => user.id === arg.id) ?? null
        );
      }

      const needsSubs = args.some(arg => {
        if (!arg.info) return false;
        const parsedInfo = parseResolveInfo(arg.info) as ResolveTree;
        return !!parsedInfo.fieldsByTypeName.User.userSubscribedTo ||
          !!parsedInfo.fieldsByTypeName.User.subscribedToUser;
      });

      const users = await cachedPrisma.user.findMany({
        where: { id: { in: ids } },
        include: {
          posts: true,
          profile: { include: { memberType: true } },
          ...(needsSubs ? {
            userSubscribedTo: { include: { author: true } },
            subscribedToUser: { include: { subscriber: true } }
          } : {})
        }
      }) as UserWithSubs[];

      return args.map(arg => users.find(user => user.id === arg.id) ?? null);
    }),

    memberTypes: new DataLoader(async (ids: readonly string[]) => {
      if (!isPreloaded && (ids.includes('ALL') || cache.memberTypes.length === 0)) {
        cache.memberTypes = await cachedPrisma.memberType.findMany();
      }
      return ids.map(id =>
        id === 'ALL' ? cache.memberTypes : cache.memberTypes.find(mt => mt.id === id) ?? null
      );
    }),

    posts: new DataLoader(async (ids: readonly string[]) => {
      if (!isPreloaded && (ids.includes('ALL') || cache.posts.length === 0)) {
        cache.posts = await cachedPrisma.post.findMany();
      }
      return ids.map(id =>
        id === 'ALL' ? cache.posts : cache.posts.find(post => post.id === id) ?? null
      );
    }),

    profiles: new DataLoader(async (ids: readonly string[]) => {
      if (!isPreloaded && (ids.includes('ALL') || cache.profiles.length === 0)) {
        cache.profiles = await cachedPrisma.profile.findMany({
          include: { memberType: true }
        });

        // Prime memberTypes
        cache.profiles.forEach(profile => {
          if (profile.memberType) {
            loaders.memberTypes.prime(profile.memberType.id, profile.memberType);
          }
        });
      }
      return ids.map(id =>
        id === 'ALL' ? cache.profiles : cache.profiles.find(profile => profile.id === id) ?? null
      );
    }),

    userSubscriptions: new DataLoader(async (userIds: readonly string[]) => {
      if (isPreloaded) return userIds.map(() => []);

      const subscriptions = await cachedPrisma.subscribersOnAuthors.findMany({
        where: { subscriberId: { in: userIds as string[] } },
        include: { author: true }
      });

      const map = new Map<string, typeof subscriptions>();
      userIds.forEach(id => map.set(id, []));
      subscriptions.forEach(sub => map.get(sub.subscriberId)?.push(sub));

      return userIds.map(id => map.get(id) || []);
    }),

    userSubscribers: new DataLoader(async (userIds: readonly string[]) => {
      if (isPreloaded) return userIds.map(() => []);

      const subscribers = await cachedPrisma.subscribersOnAuthors.findMany({
        where: { authorId: { in: userIds as string[] } },
        include: { subscriber: true }
      });

      const map = new Map<string, typeof subscribers>();
      userIds.forEach(id => map.set(id, []));
      subscribers.forEach(sub => map.get(sub.authorId)?.push(sub));

      return userIds.map(id => map.get(id) || []);
    }),

    async preloadAllData() {
      if (isPreloaded) return;

      await Promise.all([
        loaders.users.load('ALL'),
        loaders.posts.load('ALL'),
        loaders.profiles.load('ALL'),
        loaders.memberTypes.load('ALL')
      ]);

      isPreloaded = true;
    }
  };

  return loaders;
}

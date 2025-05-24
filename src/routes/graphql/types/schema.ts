import {
  GraphQLObjectType,
  GraphQLList,
  GraphQLString,
  GraphQLFloat,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLEnumType
} from 'graphql';
import { UUIDType } from './uuid.js';

export const ProfileType = new GraphQLObjectType({
  name: 'Profile',
  fields: () => ({
    id: { type: UUIDType },
    isMale: { type: GraphQLBoolean },
    yearOfBirth: { type: GraphQLInt },
    memberType: {
      type: MemberType,
      resolve: (parent, _, { loaders }) => {
        if (!parent.memberTypeId) return null;
        return loaders.memberTypes.load(parent.memberTypeId);
      }
    },
  }),
});

export const UserType = new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    id: { type: UUIDType },
    name: { type: GraphQLString },
    balance: { type: GraphQLFloat },

    profile: {
      type: ProfileType,
      resolve: (parent, _, { loaders }) => {
        return loaders.profiles.load(parent.id);
      },
    },

    posts: {
      type: new GraphQLList(PostType),
      resolve: (parent, _, { loaders }) => {
        return loaders.posts.load(parent.id);
      },
    },

    userSubscribedTo: {
      type: new GraphQLList(UserType),
      resolve: async (parent, _, context, info) => {
        const user = await context.loaders.users.load({ id: parent.id, info });

        return (user?.userSubscribedTo || []).map(sub => {
          const followedUser = sub.author;

          return {
            ...followedUser,
            subscribedToUser: followedUser?.subscribedToUser || [],
          };
        });
      },
    },

    subscribedToUser: {
      type: new GraphQLList(UserType),
      resolve: (parent, _, context, info) => {
        return context.loaders.users.load({ id: parent.id, info }).then(user => {
          return (user?.subscribedToUser || []).map(sub => sub.subscriber);
        });
      },
    },
  }),
});

export const MemberTypeIdEnumType = new GraphQLEnumType({
  name: 'MemberTypeId',
  values: {
    BASIC: { value: 'BASIC' },
    BUSINESS: { value: 'BUSINESS' },
  },
});

export const MemberType = new GraphQLObjectType({
  name: 'MemberType',
  fields: () => ({
    id: { type: MemberTypeIdEnumType },
    discount: { type: GraphQLFloat },
    postsLimitPerMonth: { type: GraphQLInt },
  }),
});

export const PostType = new GraphQLObjectType({
  name: 'Post',
  fields: () => ({
    id: { type: UUIDType },
    title: { type: GraphQLString },
    content: { type: GraphQLString },
  }),
});

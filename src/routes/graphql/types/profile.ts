import { GraphQLObjectType, GraphQLBoolean, GraphQLInt } from 'graphql';
import { PrismaClient } from '@prisma/client';
import { UUIDType } from './uuid.js';
import { MemberType } from './member.js'

export const ProfileType = new GraphQLObjectType({
  name: 'Profile',
  fields: () => ({
    id: { type: UUIDType },
    isMale: { type: GraphQLBoolean },
    yearOfBirth: { type: GraphQLInt },
    memberType: {
      type: MemberType,
      resolve: (parent, _, { prisma }: { prisma: PrismaClient }) => {
        return prisma.memberType.findUnique({ where: { id: parent.memberTypeId } });
      }
    },
  }),
});

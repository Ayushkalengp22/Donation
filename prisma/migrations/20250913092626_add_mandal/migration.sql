/*
  Warnings:

  - You are about to drop the column `mandalId` on the `User` table. All the data in the column will be lost.
  - Added the required column `password` to the `Mandal` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `User` DROP FOREIGN KEY `User_mandalId_fkey`;

-- AlterTable
ALTER TABLE `Donator` ADD COLUMN `mandalId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Mandal` ADD COLUMN `description` VARCHAR(191) NULL,
    ADD COLUMN `password` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `mandalId`;

-- CreateTable
CREATE TABLE `UserMandal` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `mandalId` INTEGER NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserMandal_userId_mandalId_key`(`userId`, `mandalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserMandal` ADD CONSTRAINT `UserMandal_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserMandal` ADD CONSTRAINT `UserMandal_mandalId_fkey` FOREIGN KEY (`mandalId`) REFERENCES `Mandal`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Donator` ADD CONSTRAINT `Donator_mandalId_fkey` FOREIGN KEY (`mandalId`) REFERENCES `Mandal`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

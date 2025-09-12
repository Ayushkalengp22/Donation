-- CreateTable
CREATE TABLE `Donator` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Donation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `donatorId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `status` ENUM('PAID', 'PARTIAL', 'PENDING') NOT NULL DEFAULT 'PENDING',
    `paidAmount` DOUBLE NOT NULL DEFAULT 0,
    `balance` DOUBLE NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `donationId` INTEGER NOT NULL,
    `amount` DOUBLE NOT NULL,
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Donation` ADD CONSTRAINT `Donation_donatorId_fkey` FOREIGN KEY (`donatorId`) REFERENCES `Donator`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Donation` ADD CONSTRAINT `Donation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentHistory` ADD CONSTRAINT `PaymentHistory_donationId_fkey` FOREIGN KEY (`donationId`) REFERENCES `Donation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

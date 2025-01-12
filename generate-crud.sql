CREATE TABLE IF NOT EXISTS `Templates` (
  `id` VARCHAR(36) NOT NULL,
  `createdOn` DATETIME NOT NULL,
  `createdBy` VARCHAR(36) NOT NULL,
  `updatedOn` DATETIME NOT NULL,
  `updatedBy` VARCHAR(36) NOT NULL,
  `deletedOn` DATETIME NULL,
  `deletedBy` VARCHAR(36) NULL,
  `name` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`))
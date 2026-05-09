DELIMITER $$

CREATE TRIGGER trg_student_memberships_before_insert_end_guard
BEFORE INSERT ON student_class_memberships
FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1
    FROM grades g
    WHERE g.id = NEW.grade_id
      AND g.tenant_id = NEW.tenant_id
      AND g.deleted_at IS NULL
      AND g.status = 'ended'
      AND g.ended_at IS NOT NULL
      AND NEW.joined_at >= g.ended_at
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'grade has ended and cannot accept new students';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM classes c
    WHERE c.id = NEW.class_id
      AND c.tenant_id = NEW.tenant_id
      AND c.deleted_at IS NULL
      AND c.status = 'ended'
      AND c.ended_at IS NOT NULL
      AND NEW.joined_at >= c.ended_at
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'class has ended and cannot accept new students';
  END IF;
END$$

CREATE TRIGGER trg_student_memberships_before_update_end_guard
BEFORE UPDATE ON student_class_memberships
FOR EACH ROW
BEGIN
  IF NEW.joined_at <> OLD.joined_at OR NEW.grade_id <> OLD.grade_id OR NEW.class_id <> OLD.class_id THEN
    IF EXISTS (
      SELECT 1
      FROM grades g
      WHERE g.id = NEW.grade_id
        AND g.tenant_id = NEW.tenant_id
        AND g.deleted_at IS NULL
        AND g.status = 'ended'
        AND g.ended_at IS NOT NULL
        AND NEW.joined_at >= g.ended_at
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'grade has ended and cannot accept new students';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM classes c
      WHERE c.id = NEW.class_id
        AND c.tenant_id = NEW.tenant_id
        AND c.deleted_at IS NULL
        AND c.status = 'ended'
        AND c.ended_at IS NOT NULL
        AND NEW.joined_at >= c.ended_at
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'class has ended and cannot accept new students';
    END IF;
  END IF;
END$$

DELIMITER ;

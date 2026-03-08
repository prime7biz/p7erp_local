import { Router } from "express";
import { db } from "../db";
import { departments, designations, employees, insertDepartmentSchema, insertDesignationSchema, insertEmployeeSchema } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { SequentialIdGenerator } from "../utils/sequentialIdGenerator";

const router = Router();

// ========================
// DEPARTMENT ROUTES
// ========================

router.get("/departments", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const result = await db
      .select()
      .from(departments)
      .where(eq(departments.tenantId, tenantId));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching departments:", error);
    return res.status(500).json({ message: "Failed to fetch departments" });
  }
});

router.get("/departments/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid department ID" });

    const [dept] = await db
      .select()
      .from(departments)
      .where(and(eq(departments.id, id), eq(departments.tenantId, tenantId)));

    if (!dept) return res.status(404).json({ message: "Department not found" });
    return res.status(200).json(dept);
  } catch (error) {
    console.error("Error fetching department:", error);
    return res.status(500).json({ message: "Failed to fetch department" });
  }
});

router.post("/departments", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const validated = insertDepartmentSchema.parse({
      ...req.body,
      tenantId,
    });

    const [created] = await db.insert(departments).values(validated).returning();
    return res.status(201).json(created);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: fromZodError(error).message });
    }
    console.error("Error creating department:", error);
    return res.status(500).json({ message: "Failed to create department" });
  }
});

router.put("/departments/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid department ID" });

    const [existing] = await db
      .select()
      .from(departments)
      .where(and(eq(departments.id, id), eq(departments.tenantId, tenantId)));

    if (!existing) return res.status(404).json({ message: "Department not found" });

    const { name, code, description, isActive } = req.body;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (code !== undefined) updateData.code = code;
    if (description !== undefined) updateData.description = description;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(departments)
      .set(updateData)
      .where(and(eq(departments.id, id), eq(departments.tenantId, tenantId)))
      .returning();

    return res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating department:", error);
    return res.status(500).json({ message: "Failed to update department" });
  }
});

router.delete("/departments/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid department ID" });

    const [existing] = await db
      .select()
      .from(departments)
      .where(and(eq(departments.id, id), eq(departments.tenantId, tenantId)));

    if (!existing) return res.status(404).json({ message: "Department not found" });

    const [updated] = await db
      .update(departments)
      .set({ isActive: false })
      .where(and(eq(departments.id, id), eq(departments.tenantId, tenantId)))
      .returning();

    return res.status(200).json({ message: "Department deactivated successfully", department: updated });
  } catch (error) {
    console.error("Error deleting department:", error);
    return res.status(500).json({ message: "Failed to delete department" });
  }
});

// ========================
// DESIGNATION ROUTES
// ========================

router.get("/designations", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const result = await db
      .select()
      .from(designations)
      .where(eq(designations.tenantId, tenantId));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching designations:", error);
    return res.status(500).json({ message: "Failed to fetch designations" });
  }
});

router.get("/designations/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid designation ID" });

    const [desig] = await db
      .select()
      .from(designations)
      .where(and(eq(designations.id, id), eq(designations.tenantId, tenantId)));

    if (!desig) return res.status(404).json({ message: "Designation not found" });
    return res.status(200).json(desig);
  } catch (error) {
    console.error("Error fetching designation:", error);
    return res.status(500).json({ message: "Failed to fetch designation" });
  }
});

router.post("/designations", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const validated = insertDesignationSchema.parse({
      ...req.body,
      tenantId,
    });

    const [created] = await db.insert(designations).values(validated).returning();
    return res.status(201).json(created);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: fromZodError(error).message });
    }
    console.error("Error creating designation:", error);
    return res.status(500).json({ message: "Failed to create designation" });
  }
});

router.put("/designations/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid designation ID" });

    const [existing] = await db
      .select()
      .from(designations)
      .where(and(eq(designations.id, id), eq(designations.tenantId, tenantId)));

    if (!existing) return res.status(404).json({ message: "Designation not found" });

    const { name, level, isActive } = req.body;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (level !== undefined) updateData.level = level;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(designations)
      .set(updateData)
      .where(and(eq(designations.id, id), eq(designations.tenantId, tenantId)))
      .returning();

    return res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating designation:", error);
    return res.status(500).json({ message: "Failed to update designation" });
  }
});

router.delete("/designations/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid designation ID" });

    const [existing] = await db
      .select()
      .from(designations)
      .where(and(eq(designations.id, id), eq(designations.tenantId, tenantId)));

    if (!existing) return res.status(404).json({ message: "Designation not found" });

    const [updated] = await db
      .update(designations)
      .set({ isActive: false })
      .where(and(eq(designations.id, id), eq(designations.tenantId, tenantId)))
      .returning();

    return res.status(200).json({ message: "Designation deactivated successfully", designation: updated });
  } catch (error) {
    console.error("Error deleting designation:", error);
    return res.status(500).json({ message: "Failed to delete designation" });
  }
});

// ========================
// EMPLOYEE ROUTES
// ========================

router.get("/employees", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const result = await db
      .select({
        id: employees.id,
        tenantId: employees.tenantId,
        employeeId: employees.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        gender: employees.gender,
        dateOfBirth: employees.dateOfBirth,
        email: employees.email,
        phone: employees.phone,
        address: employees.address,
        department: employees.department,
        designation: employees.designation,
        joinDate: employees.joinDate,
        employmentType: employees.employmentType,
        education: employees.education,
        experience: employees.experience,
        skills: employees.skills,
        salary: employees.salary,
        bankAccount: employees.bankAccount,
        isActive: employees.isActive,
        profileImage: employees.profileImage,
        emergencyContactName: employees.emergencyContactName,
        emergencyContactPhone: employees.emergencyContactPhone,
        nationalId: employees.nationalId,
        createdAt: employees.createdAt,
        updatedAt: employees.updatedAt,
        departmentId: employees.departmentId,
        designationId: employees.designationId,
        departmentName: departments.name,
        designationName: designations.name,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(designations, eq(employees.designationId, designations.id))
      .where(eq(employees.tenantId, tenantId));

    return res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching employees:", error);
    return res.status(500).json({ message: "Failed to fetch employees" });
  }
});

router.get("/employees/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid employee ID" });

    const [emp] = await db
      .select({
        id: employees.id,
        tenantId: employees.tenantId,
        employeeId: employees.employeeId,
        firstName: employees.firstName,
        lastName: employees.lastName,
        gender: employees.gender,
        dateOfBirth: employees.dateOfBirth,
        email: employees.email,
        phone: employees.phone,
        address: employees.address,
        department: employees.department,
        designation: employees.designation,
        joinDate: employees.joinDate,
        employmentType: employees.employmentType,
        education: employees.education,
        experience: employees.experience,
        skills: employees.skills,
        salary: employees.salary,
        bankAccount: employees.bankAccount,
        isActive: employees.isActive,
        profileImage: employees.profileImage,
        emergencyContactName: employees.emergencyContactName,
        emergencyContactPhone: employees.emergencyContactPhone,
        nationalId: employees.nationalId,
        createdAt: employees.createdAt,
        updatedAt: employees.updatedAt,
        departmentId: employees.departmentId,
        designationId: employees.designationId,
        departmentName: departments.name,
        designationName: designations.name,
      })
      .from(employees)
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(designations, eq(employees.designationId, designations.id))
      .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)));

    if (!emp) return res.status(404).json({ message: "Employee not found" });
    return res.status(200).json(emp);
  } catch (error) {
    console.error("Error fetching employee:", error);
    return res.status(500).json({ message: "Failed to fetch employee" });
  }
});

router.post("/employees", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const employeeId = await SequentialIdGenerator.generateEmployeeId(tenantId);

    const body = { ...req.body };
    if (body.salary !== undefined && body.salary !== null) {
      body.salary = String(body.salary);
    }

    const validated = insertEmployeeSchema.parse({
      ...body,
      tenantId,
      employeeId,
    });

    const [created] = await db.insert(employees).values(validated).returning();
    return res.status(201).json(created);
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: fromZodError(error).message });
    }
    console.error("Error creating employee:", error);
    return res.status(500).json({ message: "Failed to create employee" });
  }
});

router.put("/employees/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid employee ID" });

    const [existing] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)));

    if (!existing) return res.status(404).json({ message: "Employee not found" });

    const {
      firstName, lastName, gender, dateOfBirth, email, phone, address,
      department: dept, designation: desig, joinDate, employmentType,
      education, experience, skills, salary, bankAccount, isActive,
      profileImage, emergencyContactName, emergencyContactPhone, nationalId,
      departmentId, designationId,
    } = req.body;

    const updateData: Record<string, any> = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (gender !== undefined) updateData.gender = gender;
    if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (address !== undefined) updateData.address = address;
    if (dept !== undefined) updateData.department = dept;
    if (desig !== undefined) updateData.designation = desig;
    if (joinDate !== undefined) updateData.joinDate = joinDate;
    if (employmentType !== undefined) updateData.employmentType = employmentType;
    if (education !== undefined) updateData.education = education;
    if (experience !== undefined) updateData.experience = experience;
    if (skills !== undefined) updateData.skills = skills;
    if (salary !== undefined) updateData.salary = salary;
    if (bankAccount !== undefined) updateData.bankAccount = bankAccount;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (profileImage !== undefined) updateData.profileImage = profileImage;
    if (emergencyContactName !== undefined) updateData.emergencyContactName = emergencyContactName;
    if (emergencyContactPhone !== undefined) updateData.emergencyContactPhone = emergencyContactPhone;
    if (nationalId !== undefined) updateData.nationalId = nationalId;
    if (departmentId !== undefined) updateData.departmentId = departmentId;
    if (designationId !== undefined) updateData.designationId = designationId;

    const [updated] = await db
      .update(employees)
      .set(updateData)
      .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
      .returning();

    return res.status(200).json(updated);
  } catch (error) {
    console.error("Error updating employee:", error);
    return res.status(500).json({ message: "Failed to update employee" });
  }
});

router.delete("/employees/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(401).json({ message: "Tenant ID not found" });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid employee ID" });

    const [existing] = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)));

    if (!existing) return res.status(404).json({ message: "Employee not found" });

    const [updated] = await db
      .update(employees)
      .set({ isActive: false })
      .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
      .returning();

    return res.status(200).json({ message: "Employee deactivated successfully", employee: updated });
  } catch (error) {
    console.error("Error deleting employee:", error);
    return res.status(500).json({ message: "Failed to delete employee" });
  }
});

export default router;

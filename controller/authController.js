const User = require("../model/User")
const Clinic = require("../model/Clinic")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const { registerValidation, loginValidation, updateValidation, resetPasswordValidation, getUsersValidation, updatePermission } = require("../component/validation")

const registerController = async (req, res) => {
    //validation
    const { error } = registerValidation(req.body)
    if (error) {
        return res.status(400).send({ error: error.details[0].message })
    }
    //check if email exists in db
    const emailExist = await User.findOne({ email: req.body.email })//mongoose query
    if (emailExist) {
        return res.status(400).send({ error: "Email already exists." })
    }
    //hashing
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt)
    //create new users
    const user = new User({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: hashedPassword,
        role: req.body.role
    })
    try {
        await user.save()
        return res.status(201).send()//successfully created an account
    } catch (err) {
        return res.status(400).send({ error: err })
    }
}

const loginController = async (req, res) => {
    //validation
    const { error } = loginValidation(req.body)
    if (error) {
        return res.status(400).send(error.details[0].message)
    }
    //check email exists
    const user = await User.findOne({ email: req.body.email })
    if (!user) {
        return res.status(400).send({ error: "Email dose not exist." })
    }
    if (user.isEnabled == false) { return res.status(400).send({ error: "The account is not enabled." }) }
    //check password
    const vaildPass = await bcrypt.compare(req.body.password, user.password)
    if (!vaildPass) {
        return res.status(400).send({ error: "Incorrect login information." })
    }
    //Create token
    const exprieDate = new Date()
    exprieDate.setDate(exprieDate.getDate() + 14)
    const token = jwt.sign({ _id: user.id, expire_date: exprieDate, password: user.password }, process.env.TOKEN_SECRET)
    user.password = null
    return res.header('auth-token', token).send({ token: token, role: user.role, user: user })
}

const getUserController = async (req, res) => {
    const { userId } = req.params
    try {
        const user = await User.findById(userId, { password: 0 })
            .select("-password -__v")
        return res.status(200).send(user)
    } catch (err) {
        return res.status(400).send({ error: "Invalid user Id." })
    }
}

const updateUserController = async (req, res) => {
    const { error } = updateValidation(req.body)
    if (error) {
        return res.status(400).send(error.details[0].message)
    }
    const { userId } = req.params
    try {
        await User.findById(userId)
    } catch (err) {
        return res.status(400).send({ error: "Invalid user Id." })
    }
    // Check if any other user has the same email address
    const user = await User.findOne({ email: req.body.email })
    if (user && user._id != userId) {
        return res.status(400).send({ error: "Email already exists." })
    }
    // Update user to clinc
    try {
        const user = await User.findById(userId)
        if (user.clinic && user.clinic != req.body.clinic) {
            const oldClinic = await Clinic.findById(user.clinic)
            oldClinic.users.pull(user._id)
            await oldClinic.save()
            const newClinic = await Clinic.findById(req.body.clinic)
            newClinic.users.push(user._id)
            newClinic.save()
        } else if (!user.clinic && req.body.clinic) {
            const newClinic = await Clinic.findById(req.body.clinic)
            newClinic.users.push(user._id)
            await newClinic.save()
        }
    } catch (err) {
        console.log(err)
        return res.status(400).send({ error: "Failed to update user in clinic." })
    }
    // Update clinic to user
    try {
        await User.findByIdAndUpdate(userId, {
            firstName: req.body.firstName,
            lastName: req.body.lastName,
            email: req.body.email,
            role: req.body.role,
            clinic: req.body.clinic
        })
        return res.status(200).send()
    } catch (err) {
        return res.status(400).send({ error: "Failed to update user." })
    }
}

const resetPasswordController = async (req, res) => {
    const { error } = resetPasswordValidation(req.body)
    if (error) {
        return res.status(400).send(error.details[0].message)
    }
    const { userId } = req.params
    try {
        await User.findById(userId)
    } catch (err) {
        return res.status(400).send({ error: "Invalid user Id." })
    }
    //hashing
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt)
    try {
        await User.findByIdAndUpdate(userId, {
            password: hashedPassword
        })
        return res.status(200).send()
    } catch (err) {
        return res.status(400).send({ error: "Invalid user Id." })
    }
}


const updatePermissionController = async (req, res) => {
    const { error } = updatePermission(req.body)

    if (error) {
        return res.status(400).send(error.details[0].message)
    }
    const { userId } = req.params
    try {
        await User.findById(userId)
    } catch (err) {
        return res.status(400).send({ error: "Invalid user Id." })
    }

    try {
        await User.findByIdAndUpdate(userId, {
            isEnabled: req.body.isEnabled
        })
        return res.status(200).send()
    } catch (err) {
        return res.status(400).send({ error: "Failed to update user." })
    }
}


const getTokenInformationController = async (req, res) => {
    const { token } = req.params
    if (!token) return res.status(401).send({ error: "Missing auth token" })
    try {
        const verified = jwt.verify(token, process.env.TOKEN_SECRET);
        const user = await User.findOne({ _id: verified._id }).select("-__v")//mongoose query
        if (!user) {
            res.status(400).send({ error: "Invalid Token" });
        }
        if (user.password != verified.password) {
            res.status(400).send("Invalid Token");
        }
        if (user.isEnabled == false) { return res.status(400).send({ error: "The account is not enabled." }) }
        user.password = null
        return res.status(200).send(user)
    } catch (e) {
        res.status(400).send({ error: "Invalid Token" });
    }
}

const getUsersController = async (req, res) => {
    const { error } = getUsersValidation(req.query)
    if (error) {
        return res.status(400).send(error.details[0].message)
    }

    const { page = 1, perPage = 10, sort_by = 'date.asc', search } = req.query
    const _page = Number(page)
    const _perPage = Number(perPage)
    const searchString = new RegExp(search, "i")
    let sorter = {}
    sorter[sort_by.split('.')[0]] = sort_by.indexOf('.asc') != -1 ? 1 : -1
    try {
        const users = await User
            .find({
                $or: [
                    { firstName: searchString },
                    { lastName: searchString },
                    { email: searchString },
                    { role: searchString }
                ]
            })
            .select("-password -__v")
            .limit(_perPage)
            .skip((_page - 1) * _perPage)
            .sort(sorter)
            .exec()
        const total = await User
            .find({
                $or: [
                    { firstName: searchString },
                    { lastName: searchString },
                    { email: searchString },
                    { role: searchString }
                ]
            })
            .countDocuments()

        return res.status(200).send({
            users,
            totalResults: total,
            perPage: _perPage,
            totalPages: Math.ceil(total / _perPage),
            currentPage: _page,
            nextPage: _page + 1 > Math.ceil(total / _perPage) ? null : _page + 1,
            prevPage: _page - 1 <= 0 ? null : _page - 1
        })

    } catch (err) {
        return res.status(400).send({ error: "Failed to get users." })
    }
}

const getClinicsController = async (req, res) => {
    const clinics = await Clinic.find().select("-__v")
    if (!clinics) {
        return res.status(400).send({ error: "Failed to get clinics." })
    }
    return res.status(200).send(clinics)
}

module.exports.updatePermissionController = updatePermissionController;
module.exports.getTokenInformationController = getTokenInformationController
module.exports.registerController = registerController
module.exports.loginController = loginController
module.exports.getUserController = getUserController
module.exports.updateUserController = updateUserController
module.exports.resetPasswordController = resetPasswordController
module.exports.getUsersController = getUsersController
module.exports.getClinicsController = getClinicsController

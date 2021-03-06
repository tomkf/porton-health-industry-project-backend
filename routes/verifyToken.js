const jwt = require('jsonwebtoken')
const User = require("../model/User")


module.exports.auth = function (role) {
    return async function (req, res, next) {
        const token = req.header("auth-token")

        if (!token) return res.status(401).send({ error: "Missing auth token" })
        try {
            const verified = jwt.verify(token, process.env.TOKEN_SECRET);
            const user = await User.findOne({ _id: verified._id })//mongoose query
            if (!user) {
                res.status(400).send("Invalid Token");
            }
            if (user.password != verified.password) {
                res.status(400).send("Invalid Token");
            }
            if (user.role != role) {
                return res.status(401).send({ error: "Not Authorized" });
            }

            req.user = verified
            req.role = role
            next()
        } catch (e) {
            res.status(400).send({ error: "Invalid Token" });
        }

    }
}
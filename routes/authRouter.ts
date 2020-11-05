import {Request,Response,NextFunction,Router} from "express";
import { IUser } from '../interfaces';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import createError from 'http-errors';
const {generateAccessToken,generateRefreshToken,verifyToken} = require('../middleware/verifyToken');
const router = Router();
import {pool} from "../dbConfig";
import Hashids from 'hashids';
const hashids = new Hashids(process.env.HASHIDS_SALT);



       //Refresh Token Dizisi
       let refreshTokens = [];
       let accessTokens = []; //Black list after logout

      router.get("/login",(req,res)=>{
        res.json({ error:{},message: "Lütfen Giriş Yapın",token:{} });
      });

      //Kullanıcı Girişi
      router.post("/login",(req: Request,res: Response)=>{
        // email , password check coming here soon...
        pool.query(
          `SELECT * FROM users WHERE email = $1`,
          [req.body.email],
          (err, results) => {
            if (err) {
              throw err;
            }
            console.log(results.rows);
    
            if (results.rows.length > 0) {
              const user:IUser = results.rows[0];
              console.log(user);
              bcrypt.compare(req.body.password, user.password, (err, isMatch) => {
                if (err) {
                  console.log(err);
                }
                if (isMatch) {
                  //Giriş Başarılı
                  let hashedid = hashids.encode(user.id);
                  user.id=hashedid;
                  const accessToken=generateAccessToken(user);
                  const refreshToken=generateRefreshToken(user);
                  refreshTokens.push(refreshToken);
                  return res.header('authorization',accessToken).send({user: user,accessToken: accessToken,refreshToken: refreshToken});
                } else {
                  //password is incorrect
                  return res.status(401).send({ message: "Email yada Şifre Hatalı!" });
                }
              });
            } else {
              // No user
              return res.status(401).send({
                message: "Email yada Şifre Hatalı!"
              });
            }
          }
        );
      });

      //Yetkilendirmeli alan
      router.get("/dashboard",verifyToken, (req: Request,res: Response) => {
        const token = req.headers['authorization'];
        res.json({code: true,
          message: "Giriş Başarılı.",
          token,
          user:{id: req.tokenUser.id, name: req.tokenUser.name }});
      });
      router.delete('/logout', (req: Request,res: Response)=>{
        const {refreshToken} = req.body.token;
        if(!refreshToken) throw res.sendStatus(400);
        //normalde burada veri tabanından silmek gerekiyor refresh tokenleri
        refreshTokens = refreshTokens.filter( token=> token !== req.body.token)
        accessTokens = accessTokens.filter( token=> token !== req.body.token)
        res.status(200).send({message: "Token Başarıyla Silindi."})
      })
      
       //Refreshing a token
       router.post('/token',(req: Request,res: Response,next: NextFunction)=>{
        const refreshToken = req.body.token //refresh token'i oku
        if(refreshToken == null) return res.sendStatus(401)  //boş ise hata yolla
        if(!refreshTokens.includes(refreshToken)) return res.status(403).send({message: "RefreshToken Geçersiz"}) //(refreshTokens)dizide var ise hata yolla
        //refreshTokens.pop();
        jwt.verify(refreshToken,process.env.REFRESH_TOKEN_SECRET,(err:Error, user:IUser)=>{
          if(err){
          const message=
            err.name ==='JsonWebTokenError'? 'Unauthorized':err.message
          return res.send(createError.Unauthorized(message))}
          //Burayı Düzelt
          const user2 = ({
            id: user.id, 
            name: user.name,
            email: user.email,
            password: user.password

          });
          const accessToken = generateAccessToken(user2)
          const refToken=generateRefreshToken(user2)
          refreshTokens.push(refToken);
          res.json({accessToken: accessToken})
        })
       })



module.exports = router